# Categorias de receita — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Nenhum step faz commit: o usuário testa e commita.

**Goal:** Trocar a categoria genérica "Receitas" por categorias de receita específicas, sem categoria automática para receitas na importação, e filtrar o seletor de categoria pelo tipo da linha.

**Architecture:** Lista padrão (`src/domain/defaults.ts`) e regra da importação (`src/domain/import-plan.ts` + `getFallbackCategories`) mudam no domínio; uma função pura `categoriesForType` filtra os seletores; uma migração SQL ajusta os dados de quem já tem conta.

**Tech Stack:** Next.js 15 (App Router), Drizzle ORM + postgres-js, Vitest.

**Spec:** `docs/superpowers/specs/fase-4/2026-11-02-categorias-de-receita-design.md`

## Global Constraints

- **Não fazer commits.** Deixar as mudanças no working tree e reportar como testar.
- **Não rodar `next dev`/`next build`** (o servidor do usuário usa a mesma `.next`). Verificação: `npx tsc --noEmit` (ignorar erros em `.next/`), `npx eslint src tests`, `npx vitest run`.
- Categorias de receita, nesta ordem e com estas cores, todas `tipo: "RECEITA"`: `Salário` `#16a34a`, `Freelance / Serviços` `#0d9488`, `Reembolsos` `#65a30d`, `Transferência própria` `#059669`, `Outras receitas` `#4d7c0f`.
- A categoria `Receitas` deixa de existir (defaults e dados). `Movimentação` não muda.
- O tipo da transação (parser) não muda.
- Toda consulta filtra por `user_id`.

## Review Focus

- Receita com regra que casa precisa continuar recebendo a categoria da regra (a regra vence). Teste na Task 1 (`rule wins over type fallback`, já existente, segue verde).
- Linha cuja categoria atual é de outro tipo (tipo trocado depois) não pode ficar com o seletor mostrando vazio. Teste na Task 2 (`keeps the current category of another type`).
- Usuário que já criou uma categoria chamada "Salário" (ou outra das cinco): a migração não pode falhar por duplicidade. Garantido por `on conflict (user_id, nome) do nothing` na Task 3.
- Usuário que renomeou "Receitas" ou criou uma categoria GASTO chamada "Receitas": só se apaga `nome = 'Receitas' and tipo = 'RECEITA'`. Task 3.
- Detalhe da fatura (`/cartao/[faturaId]`) também usa `PurchaseCategory`: deve mostrar só categorias de gasto. Task 2, Step 5.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/domain/defaults.ts` | lista padrão sem "Receitas", com as cinco de receita |
| `src/domain/import-plan.ts` | fallback só para Movimentação |
| `src/db/queries.ts` | `getFallbackCategories` devolve só `{ MOVIMENTACAO }` |
| `src/domain/category-options.ts` (novo) | `categoriesForType` |
| `src/app/(app)/transacoes/transaction-row.tsx`, `src/app/(app)/cartao/purchase-category.tsx` | seletores filtrados |
| `drizzle/0006_categorias_receita.sql` + `drizzle/meta/_journal.json` | migração dos dados atuais |

---

### Task 1: Defaults e importação

**Files:**
- Modify: `src/domain/defaults.ts`, `src/domain/import-plan.ts:17,27-29`, `src/db/queries.ts:27-35`
- Test: `tests/domain/import-plan.test.ts`, `tests/domain/defaults.test.ts` (novo)

**Interfaces:**
- Produces:
  ```ts
  // import-plan.ts
  export function buildImportPlan(parsed: ParseResult, existingHashes: Set<string>, rules: Rule[],
    categoriaPorTipo: { MOVIMENTACAO: string | null }): ImportPlan;
  // queries.ts
  export async function getFallbackCategories(userId: string): Promise<{ MOVIMENTACAO: string | null }>;
  ```

- [ ] **Step 1: Write the failing tests.**
  - Em `tests/domain/import-plan.test.ts`: `fallback = { MOVIMENTACAO: "mov" }`; em `categorizes rows`, `expect(cat("FULANO")).toBeNull()` e `expect(plan.semCategoria).toBe(2)`. `rule wins over type fallback` não muda.
  - `tests/domain/defaults.test.ts`:
    ```ts
    test("no generic 'Receitas' category", () => {
      expect(DEFAULT_CATEGORIES.map((c) => c.nome)).not.toContain("Receitas");
    });
    test("income categories", () => {
      expect(DEFAULT_CATEGORIES.filter((c) => c.tipo === "RECEITA").map((c) => c.nome)).toEqual(
        ["Salário", "Freelance / Serviços", "Reembolsos", "Transferência própria", "Outras receitas"]);
    });
    test("unique names", () => {
      const nomes = DEFAULT_CATEGORIES.map((c) => c.nome);
      expect(new Set(nomes).size).toBe(nomes.length);
    });
    test("every default rule points to an existing category", () => {
      const nomes = new Set(DEFAULT_CATEGORIES.map((c) => c.nome));
      for (const r of DEFAULT_RULES) expect(nomes).toContain(r.categoria);
    });
    ```

- [ ] **Step 2: Run** `npx vitest run tests/domain/import-plan.test.ts tests/domain/defaults.test.ts` → FAIL (`FULANO` = `"receitas"`; lista ainda tem "Receitas").

- [ ] **Step 3: Implement.** `defaults.ts`: trocar a entrada `Receitas` pelas cinco do Global Constraints. `import-plan.ts`: categoria = regra ?? (`row.tipo === "MOVIMENTACAO"` ? `categoriaPorTipo.MOVIMENTACAO` : `null`). `queries.ts`: buscar só `"Movimentação"`; atualizar o comentário.

- [ ] **Step 4: Run** os mesmos testes → PASS; `npx tsc --noEmit` sem erros fora de `.next/` (`importar/actions.ts` compila sem mudança).

---

### Task 2: Seletor de categoria filtrado pelo tipo

**Files:**
- Create: `src/domain/category-options.ts`
- Test: `tests/domain/category-options.test.ts`
- Modify: `src/app/(app)/transacoes/transaction-row.tsx`, `src/app/(app)/cartao/purchase-category.tsx`

**Interfaces:**
- Produces:
  ```ts
  /** Categorias do tipo, mais a atual quando for de outro tipo; mantém a ordem recebida. */
  export function categoriesForType<C extends { id: string; tipo: TxType }>(
    categories: C[], tipo: TxType, currentId: string | null): C[];
  ```

- [ ] **Step 1: Write the failing tests** com `cats = [{ id: "a", tipo: "GASTO" }, { id: "b", tipo: "RECEITA" }, { id: "c", tipo: "GASTO" }, { id: "d", tipo: "MOVIMENTACAO" }]`:
  - `filters by type` → `categoriesForType(cats, "GASTO", null).map((c) => c.id)` = `["a", "c"]`
  - `income` → `(cats, "RECEITA", null)` = `["b"]`
  - `keeps the current category of another type` → `(cats, "RECEITA", "a")` = `["a", "b"]`
  - `current of the same type adds nothing` → `(cats, "GASTO", "c")` = `["a", "c"]`

- [ ] **Step 2: Run** `npx vitest run tests/domain/category-options.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implement** `categoriesForType` (filter por `c.tipo === tipo || c.id === currentId`).

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Usar nos seletores.**
  - `transaction-row.tsx`: `type Categories = { id: string; nome: string; tipo: TxType }[]`; `AccountEntryRow` monta `categoryItems` com `categoriesForType(categories, row.tipo, row.categoryId)`; `CardEntryRow` passa `categoriesForType(categories, "GASTO", row.categoryId)` para `PurchaseCategory`.
  - `purchase-category.tsx`: `categories` ganha `tipo: TxType` e é filtrado internamente com `categoriesForType(categories, "GASTO", categoryId)` (cobre o detalhe da fatura); em `CardEntryRow` passar a lista inteira, sem filtrar de novo.
  - As páginas já passam o resultado de `getCategories` (que tem `tipo`); ajustar só se o `tsc` acusar.

- [ ] **Step 6: Verify.** `npx tsc --noEmit`, `npx eslint src tests`, `npx vitest run` → limpos.

---

### Task 3: Migração dos dados atuais

**Files:**
- Create: `drizzle/0006_categorias_receita.sql`
- Modify: `drizzle/meta/_journal.json` (entrada `idx: 6`, `tag: "0006_categorias_receita"`, `version: "7"`, `when` maior que o da 0005, `breakpoints: true`)

- [ ] **Step 1: Escrever a migração** (sem mudança de schema, então sem snapshot novo):
  ```sql
  INSERT INTO "categories" ("user_id", "nome", "cor", "tipo")
  SELECT u.user_id, c.nome, c.cor, 'RECEITA'
  FROM (SELECT DISTINCT "user_id" FROM "categories") u
  CROSS JOIN (VALUES
    ('Salário', '#16a34a'), ('Freelance / Serviços', '#0d9488'), ('Reembolsos', '#65a30d'),
    ('Transferência própria', '#059669'), ('Outras receitas', '#4d7c0f')
  ) AS c(nome, cor)
  ON CONFLICT ("user_id", "nome") DO NOTHING;--> statement-breakpoint
  DELETE FROM "categories" WHERE "nome" = 'Receitas' AND "tipo" = 'RECEITA';
  ```

- [ ] **Step 2: Verify** `npx drizzle-kit check` sem erros. Com `TEST_DATABASE_URL`: aplicar no banco de teste e conferir que cada usuário tem as cinco e nenhuma `Receitas`.

- [ ] **Step 3: Conferência manual (usuário):** aplicar a migração no banco (`npx drizzle-kit migrate`, como nas fases anteriores) e:
  - Configurações: cinco categorias de receita; "Receitas" sumiu.
  - Transações out/2026, tipo Receita: 15 linhas Sem categoria; o seletor mostra só as cinco de receita; escolher "Salário" oferece criar a regra.
  - Linha de Gasto: seletor só com categorias de gasto. Detalhe da fatura idem.
  - Importar um extrato com "Pix recebido" sem regra: prévia conta como sem categoria.
