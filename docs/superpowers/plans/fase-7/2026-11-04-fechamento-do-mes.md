# Fechamento do mês — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pix entre contas próprias chegam como transferência. Um fechamento mensal guiado deixa cada mês classificado e conferido. Os Relatórios usam só meses fechados, e o Dashboard continua ao vivo.

**Architecture:** O domínio puro (`src/domain/titular.ts`, `src/domain/closing.ts`) cuida de:
- reconhecer o titular;
- calcular a assinatura e o status do mês;
- separar as pendências de cada passo;
- filtrar o período dos relatórios.

O banco ganha `user_settings` (nome no extrato) e `month_closings` (selo + assinatura), acessados por `src/db/settings.ts` e `src/db/closings.ts`.

A tela `/fechamento` reaproveita as linhas de Transações. Os Relatórios recebem o período já filtrado por `loadPeriod`.

**Tech Stack:** Next.js 15 (App Router, server actions), Drizzle ORM + Postgres (Supabase), Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/fase-7/2026-11-04-fechamento-do-mes-design.md`

## Global Constraints

- **Sem passos de commit:** o usuário testa e commita.
- **Não rodar** `next dev`/`next build`: o usuário mantém o dev server dele. A verificação usa `npx tsc --noEmit`, `npx eslint` e `npx vitest run`.
- **`TEST_DATABASE_URL` está vazio:** os testes de banco são pulados. A lógica testável fica em `src/domain/`. As migrações são aplicadas no dev com `npx drizzle-kit migrate`. São todas aditivas e não alteram dados.
- **Valores em centavos, com sinal.** `MonthKey` é `"AAAA-MM"`.
- **Casamento do titular:** `normalize(descricao) === normalize(nome)`, usando o `normalize` de `src/domain/categorization.ts`. Nunca "contém". Nome vazio ou só espaços = sem titular.
- **Nome da categoria de transferência:** exatamente `"Transferência própria"`.
- **Status do mês:** `"ABERTO" | "FECHADO" | "ALTERADO"`. Os rótulos de tela são "Aberto", "Fechado em DD/MM" e "Alterado depois do fechamento".
- **Textos fixados pela spec:**
  - Ajuda do nome: "Pix enviados ou recebidos com exatamente este nome são transferências entre suas contas."
  - Card do Dashboard: "{Mês} ainda não foi fechado"
  - Aviso de renda: "Você recebeu {R$ X} de você mesmo em {mês} e nada foi marcado como renda. Algum foi salário?"
  - Aviso dos Relatórios: "Fora dos relatórios (ainda abertos): …" e "⚠ Alterado depois do fechamento: …"
  - Estado vazio: "Nenhum mês fechado neste período"
- **O passo 2 do fechamento não oferece criar regra.**
- **Fechar ou reabrir não altera transações.** A assinatura é sempre calculada no servidor.

## Review Focus

1. **Nome digitado com espaços, outra caixa ou sem acento** (ex.: `" rodriggo alves areba"`) casa com "RODRIGGO ALVES AREBA". Teste na Task 2.
2. **Nome vazio não casa com nada.** Um `""` salvo não pode transformar descrições vazias em transferência. Teste na Task 2.
3. **Período só com meses abertos:** os Relatórios mostram o estado vazio, sem quebrar, dividir por zero ou exportar CSV vazio sem aviso. Teste de `closedPeriod` na Task 3. A página trata o caso vazio na Task 6.
4. **Pix *enviado* a si mesmo não pode virar Salário.** Escolher uma categoria de receita para um valor negativo é recusado no servidor. Teste de `titularChoiceToUpdate` na Task 3.
5. **Salário picado, com só uma parte marcada** (setembro: R$ 1.800 como Salário, R$ 2.219,52 ainda transferência): o aviso de renda do Dashboard **não** aparece, porque já existe renda do titular. O passo 2 continua listando as duas partes. Teste de `incomeHint` na Task 3.

---

### Task 1: Banco — `user_settings` e `month_closings`

**Files:**
- Modify: `src/db/schema.ts` (duas tabelas novas + tipos exportados)
- Create: `drizzle/0011_fechamento.sql` (gerado), `drizzle/0012_fechamento_rls.sql` (custom)
- Create: `src/db/settings.ts`, `src/db/closings.ts`

**Interfaces:**
- Produces, em `src/db/settings.ts`:
  - `getNomeExtrato(db: Db, userId: string): Promise<string | null>`
  - `setNomeExtrato(db: Db, userId: string, nome: string | null): Promise<void>` (upsert)
- Produces, em `src/db/closings.ts`:
  - `type Closing = { mes: MonthKey; assinatura: string; fechadoEm: Date }`
  - `getClosings(db: Db, userId: string, meses: MonthKey[]): Promise<Map<MonthKey, Closing>>`
  - `saveClosing(db: Db, userId: string, mes: MonthKey, assinatura: string): Promise<void>`: upsert em `(user_id, mes)` que atualiza `assinatura` e `fechado_em = now()`
  - `deleteClosing(db: Db, userId: string, mes: MonthKey): Promise<void>`

- [ ] **Step 1: Schema**

`userSettings`:

| Campo | Coluna |
|---|---|
| `userId` | `uuid("user_id").primaryKey()` |
| `nomeExtrato` | `text("nome_extrato")` (nullable) |

`monthClosings`:

| Campo | Coluna |
|---|---|
| `id` | uuid PK `defaultRandom()` |
| `userId` | uuid NOT NULL |
| `mes` | `text("mes")` NOT NULL |
| `fechadoEm` | `timestamp("fechado_em", { withTimezone: true })` NOT NULL `defaultNow()` |
| `assinatura` | text NOT NULL |

`monthClosings` tem `unique().on(t.userId, t.mes)`.

- [ ] **Step 2: Migrações**

- `npx drizzle-kit generate --name fechamento`
- `npx drizzle-kit generate --custom --name fechamento_rls`, com o mesmo cabeçalho de `0008_investimentos_rls.sql`:

```sql
-- Mesma política de 0001 e 0003: bloqueia a API pública do Supabase; o app usa o papel dono.
ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "month_closings" ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 3: Funções de banco**

Implemente `settings.ts` e `closings.ts` com as assinaturas acima, no padrão de `src/db/imports.ts` (recebem `Db`).

- [ ] **Step 4: Aplicar e verificar**

- Run: `npx drizzle-kit check` → "Everything's fine".
- Run: `npx drizzle-kit migrate` (dev) → "migrations applied successfully".
- Run: `npx tsc --noEmit` → limpo.

---

### Task 2: Titular — importação e Configurações

**Files:**
- Create: `src/domain/titular.ts`
- Modify: `src/domain/import-plan.ts` (assinatura de `buildImportPlan`)
- Modify: `src/db/queries.ts` (`getFallbackCategories`)
- Modify: `src/app/(app)/importar/actions.ts` (`plan` passa o titular)
- Modify: `src/app/(app)/configuracoes/actions.ts` (`saveNomeExtrato`), `src/app/(app)/configuracoes/page.tsx`
- Create: `src/app/(app)/configuracoes/nome-extrato-section.tsx`
- Test: `tests/domain/titular.test.ts`, `tests/domain/import-plan.test.ts`

**Interfaces:**
- Consumes: `getNomeExtrato`, `setNomeExtrato` (Task 1).
- Produces:
  - `cleanNome(nome: string | null | undefined): string | null`: `trim`; vazio vira `null`.
  - `isTitular(descricao: string, nome: string | null): boolean`
  - `buildImportPlan(parsed, existingHashes, rules, categoriaPorTipo: { MOVIMENTACAO: string | null; TRANSFERENCIA_PROPRIA: string | null }, titular: string | null): ImportPlan`
  - `getFallbackCategories` passa a devolver também `TRANSFERENCIA_PROPRIA`: o id da categoria "Transferência própria" do usuário, ou `null`.
  - `saveNomeExtrato(nome: string): Promise<{ error?: string }>` (server action)

- [ ] **Step 1: Escrever os testes que falham**

`tests/domain/titular.test.ts`:

```ts
test("casa por igualdade normalizada (Review Focus 1)", () => {
  expect(isTitular("RODRIGGO ALVES AREBA", " rodriggo alves areba ")).toBe(true);
  expect(isTitular("Rodriggo Alves Arebá", "RODRIGGO ALVES AREBA")).toBe(true);
});
test("não casa por 'contém'", () => {
  expect(isTitular("RODRIGGO ALVES AREBA LTDA", "RODRIGGO ALVES AREBA")).toBe(false);
});
test("nome vazio não casa com nada (Review Focus 2)", () => {
  expect(isTitular("", "")).toBe(false);
  expect(isTitular("", "   ")).toBe(false);
  expect(isTitular("X", null)).toBe(false);
  expect(cleanNome("  ")).toBeNull();
  expect(cleanNome(" Rodriggo ")).toBe("Rodriggo");
});
```

`tests/domain/import-plan.test.ts`:
- Atualize as chamadas existentes para `fallback = { MOVIMENTACAO: "mov", TRANSFERENCIA_PROPRIA: "transf" }` e quinto argumento `null`.
- `describe("titular")`, com as regras `[{ padrao: "RODRIGGO", categoryId: "sal", tipo: "RECEITA" }]` e o titular `"RODRIGGO ALVES AREBA"`:
  - `"Pix recebido do titular vira transferência, antes das regras"`: `row("RODRIGGO ALVES AREBA","RECEITA","t1")` → `{ tipo: "MOVIMENTACAO", categoryId: "transf" }`.
  - `"Pix enviado ao titular também"`: `row(..., "GASTO", "t2")` → `{ tipo: "MOVIMENTACAO", categoryId: "transf" }`.
  - `"movimentação e estorno do parser não mudam"`: `row("RODRIGGO ALVES AREBA","ESTORNO","t3")` mantém `tipo: "ESTORNO"`.
  - `"sem titular, nada muda"`: com titular `null`, a linha recebida casa com a regra → `{ tipo: "RECEITA", categoryId: "sal" }`.
  - `"sem a categoria, a transferência fica sem categoria"`: com `TRANSFERENCIA_PROPRIA: null` → `{ tipo: "MOVIMENTACAO", categoryId: null }`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/domain/titular.test.ts tests/domain/import-plan.test.ts`
Expected: FAIL (módulo `@/domain/titular` não existe; assinatura antiga).

- [ ] **Step 3: Implementar o domínio**

- `titular.ts` com `cleanNome` e `isTitular` (`normalize` de `categorization.ts`).
- Em `buildImportPlan`: se `row.tipo` for `GASTO` ou `RECEITA` e `isTitular(row.descricao, titular)`, a linha vira `{ tipo: "MOVIMENTACAO", categoryId: categoriaPorTipo.TRANSFERENCIA_PROPRIA }` e as regras não são consultadas. O resto não muda.

- [ ] **Step 4: Ligar banco, importação e Configurações**

- `getFallbackCategories`: busca também a categoria de nome `"Transferência própria"`.
- `plan()` em `importar/actions.ts`: carrega `getNomeExtrato(db, userId)` junto do resto e passa como quinto argumento.
- `saveNomeExtrato(nome)`:
  - recusa não-string com `{ error: "Nome inválido" }`;
  - grava `cleanNome(nome)` via `setNomeExtrato`;
  - chama `revalidatePath("/", "layout")`.
- `NomeExtratoSection` (client): um `Card` "Seu nome no extrato", com `Input`, o botão "Salvar" e o texto de ajuda das Global Constraints. Usa toast de sucesso ou erro, como `rules-section.tsx`.
- `page.tsx` de Configurações: carrega `getNomeExtrato` e renderiza a seção antes de Categorias.

- [ ] **Step 5: Verificar**

Run: `npx vitest run tests/domain` → PASS. Run: `npx tsc --noEmit` e `npx eslint src` → limpos.

---

### Task 3: Domínio do fechamento

**Files:**
- Create: `src/domain/closing.ts`
- Test: `tests/domain/closing.test.ts` (use `conta`/`cartao`/`cats` de `tests/domain/reports/helpers.ts`)

**Interfaces:**
- Consumes: `isTitular` (Task 2); `MonthEntry`, `AccountEntry` (`src/domain/entries.ts`); `MonthEntries` (`src/domain/reports/period.ts`); `countsAsExpense` (`tx-type.ts`).
- Produces, em `closing.ts`:
  - `type MonthStatus = "ABERTO" | "FECHADO" | "ALTERADO"`
  - `entriesSignature(entries: MonthEntry[]): string`: sha256 hex (`node:crypto`) de `${origem}:${id}|${valor}|${tipo}|${categoryId ?? ""}`, com as linhas ordenadas e unidas por `\n`.
  - `monthStatus(closing: { assinatura: string } | null | undefined, entries: MonthEntry[]): MonthStatus`
  - `closedPeriod(periodo: MonthEntries, closings: Map<MonthKey, { assinatura: string }>): { periodo: MonthEntries; abertos: MonthKey[]; alterados: MonthKey[] }`: mantém FECHADO e ALTERADO, na ordem.
  - `type ClosingSteps = { titular: AccountEntry[]; entradas: AccountEntry[]; gastos: MonthEntry[] }`
  - `closingSteps(entries: MonthEntry[], nome: string | null): ClosingSteps`:
    - `titular`: lançamentos da conta do titular (qualquer tipo ou sentido);
    - `entradas`: da conta, `tipo === "RECEITA"`, sem categoria, não titular;
    - `gastos`: `countsAsExpense`, sem categoria, de qualquer origem; se for da conta, não titular.
  - `pendingCount(steps: ClosingSteps): { titular: number; entradas: number; gastos: number; total: number }`: `titular` conta só os do titular com `valor > 0`, `tipo === "RECEITA"` e sem categoria.
  - `incomeHint(entries: MonthEntry[], nome: string | null): number | null`: soma dos valores > 0 do titular, quando existe ao menos um e **nenhum** lançamento do titular é `RECEITA`; senão `null`.
  - `type TitularChoice = "TRANSFERENCIA" | "GASTO" | { categoryId: string }`
  - `titularChoiceToUpdate(choice: TitularChoice, valor: number, transferenciaId: string | null, receitaIds: string[]): { tipo: TxType; categoryId: string | null } | null`:
    - `"TRANSFERENCIA"` → `{ MOVIMENTACAO, transferenciaId }`;
    - `"GASTO"` só se `valor < 0` → `{ GASTO, null }`;
    - `{ categoryId }` só se `valor > 0` e o id estiver em `receitaIds` → `{ RECEITA, categoryId }`;
    - qualquer outra combinação → `null`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
const nome = "RODRIGGO ALVES AREBA";
const eu = (valor: number, tipo: TxType = valor > 0 ? "RECEITA" : "GASTO", categoryId: string | null = null) =>
  conta(valor, { descricao: nome, tipo, categoryId });
```

- `entriesSignature`:
  - `"estável na ordem"`: `[a, b]` e `[b, a]` dão a mesma assinatura;
  - `"muda com valor, tipo, categoria, inclusão e remoção"`: cada variação dá uma assinatura diferente da original.
- `monthStatus`:
  - `null` → `"ABERTO"`;
  - com a assinatura das próprias entradas → `"FECHADO"`;
  - depois de acrescentar um lançamento → `"ALTERADO"`.
- `closedPeriod`:
  - `"mantém fechados e alterados, lista abertos"`: três meses, um sem fechamento, um igual e um diferente → `periodo` com 2, `abertos` com 1, `alterados` com 1;
  - `"tudo aberto dá período vazio (Review Focus 3)"` → `{ periodo: [], abertos: [os 3], alterados: [] }`.
- `closingSteps` / `pendingCount`, com as entradas:
  - `eu(180000)`
  - `eu(221952, "MOVIMENTACAO", "transf")`
  - `eu(-2000)`
  - `conta(1200)` (receita sem categoria)
  - `conta(-500)` (gasto sem categoria)
  - `cartao(-900)` (sem categoria)
  - `conta(-300, { categoryId: "alim" })`

  Resultado esperado:
  - `titular.length === 3`, `entradas.length === 1`, `gastos.length === 2`;
  - o gasto do titular não está em `gastos`;
  - `pendingCount` → `{ titular: 1, entradas: 1, gastos: 2, total: 4 }`.
- `incomeHint`:
  - `"soma o que veio do titular quando nada é renda"`: `[eu(180000,"MOVIMENTACAO","transf"), eu(221952,"MOVIMENTACAO","transf")]` → `401952`;
  - `"salário picado com uma parte marcada não avisa (Review Focus 5)"`: `[eu(180000,"RECEITA","sal"), eu(221952,"MOVIMENTACAO","transf")]` → `null`;
  - `"sem titular ou sem Pix recebido"` → `null`.
- `titularChoiceToUpdate`:
  - `("TRANSFERENCIA", 100, "transf", ["sal"])` → `{ tipo: "MOVIMENTACAO", categoryId: "transf" }`;
  - `({ categoryId: "sal" }, 100, …)` → `{ tipo: "RECEITA", categoryId: "sal" }`;
  - `"Pix enviado não vira salário (Review Focus 4)"`: `({ categoryId: "sal" }, -100, …)` → `null`;
  - `("GASTO", -100, …)` → `{ tipo: "GASTO", categoryId: null }`;
  - `("GASTO", 100, …)` → `null`;
  - `({ categoryId: "alim" }, 100, "transf", ["sal"])` → `null`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/domain/closing.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar `closing.ts`** com as assinaturas acima.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/domain` → PASS. Run: `npx tsc --noEmit` → limpo.

---

### Task 4: Tela de fechamento

**Files:**
- Create: `src/app/(app)/transacoes/row-data.ts`: `toRowData(e: MonthEntry): RowData`, extraído do `map` de `transacoes/page.tsx`. A página passa a usar essa função.
- Create: `src/app/(app)/fechamento/page.tsx` (server)
- Create: `src/app/(app)/fechamento/actions.ts`
- Create: `src/app/(app)/fechamento/titular-step.tsx` (client)
- Create: `src/app/(app)/fechamento/close-buttons.tsx` (client)

**Interfaces:**
- Consumes:
  - `closingSteps`, `pendingCount`, `monthStatus`, `entriesSignature`, `titularChoiceToUpdate` (Task 3);
  - `getClosings`, `saveClosing`, `deleteClosing`, `getNomeExtrato` (Task 1);
  - `saveNomeExtrato` (Task 2);
  - `getMonthEntries`, `getCategories`, `getAvailableMonths`, `getInvoiceForMonth`, `getFallbackCategories`;
  - `TransactionRow`, `RuleOfferProvider`, `MonthPicker`.
- Produces (server actions):
  - `classifyTitularEntry(id: string, choice: TitularChoice): Promise<{ error?: string }>`
  - `closeMonthAction(mes: string): Promise<{ error?: string }>`
  - `reopenMonthAction(mes: string): Promise<{ error?: string }>`

- [ ] **Step 1: Actions**

`classifyTitularEntry`:
- valida `isUuid(id)`;
- lê a transação do usuário (`valor`, `descricao`) e confirma `isTitular(descricao, nome)`; se não for, devolve `{ error: "Transação não é sua" }`;
- monta `transferenciaId` (`getFallbackCategories`) e `receitaIds` (categorias `RECEITA` do usuário);
- se `titularChoiceToUpdate` der `null`, devolve `{ error: "Opção inválida" }`;
- senão faz o `update` + `revalidatePath("/", "layout")`.

`closeMonthAction`:
- `parseMonth`; inválido → `{ error: "Mês inválido" }`;
- `saveClosing(db, userId, mes, entriesSignature(await getMonthEntries(db, userId, mes)))`.

`reopenMonthAction`: `deleteClosing`.

- [ ] **Step 2: Página**

- `mes = parseMonth(sp.mes) ?? addMonths(currentMonth(), -1)`.
- Cabeçalho: "Fechamento de {formatMonth(mes)}", o status (rótulos das Global Constraints) e o `MonthPicker`.
- Passos, cada um um `Card` com título numerado. Um passo sem itens mostra "Tudo certo".
  1. **Importações:**
     - "Último lançamento do extrato: DD/MM", que é a maior `data` dos lançamentos `CONTA`; sem nenhum, mostra "Nenhum lançamento do extrato neste mês";
     - status da fatura de `getInvoiceForMonth`: "Importada", "Projetada" ou "Sem fatura";
     - links para `/importar` e `/cartao`.
  2. **Pix entre suas contas e renda:**
     - sem nome: um formulário inline que chama `saveNomeExtrato`;
     - com nome: `TitularStep` com `steps.titular`;
     - rodapé "Renda do mês: {formatBRL(soma das RECEITA do mês)}".
  3. **Entradas sem categoria:** `steps.entradas`, com `TransactionRow` + `toRowData`.
  4. **Gastos sem categoria:** `steps.gastos`, com `TransactionRow` + `toRowData`.
  5. **Resumo:**
     - Entradas, Gastos e Saldo calculados como no Dashboard (`summarizeSpending` + soma de `RECEITA`);
     - "{n} pendências" vindo de `pendingCount`;
     - `CloseButtons`.

  Os passos 3 e 4 ficam dentro de `RuleOfferProvider`.
- `TitularStep`: cada linha tem data, valor e um `Select` "O que foi?":
  - valor > 0: "Transferência própria" + cada categoria `RECEITA`;
  - valor < 0: "Transferência própria" e "Gasto".

  O valor atual vem do lançamento (`MOVIMENTACAO` → "Transferência própria"; `RECEITA` com categoria → essa categoria; o resto fica sem seleção). A troca chama `classifyTitularEntry` e mostra toast em caso de erro. **Sem oferta de regra.**
- `CloseButtons`: recebe `status` e `pendencias`.
  - ABERTO: "Fechar mês", ou "Fechar mesmo assim" se `pendencias > 0`;
  - ALTERADO: "Refechar" + "Reabrir";
  - FECHADO: "Reabrir".

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`, `npx eslint src`, `npx vitest run tests/domain` → limpos/PASS.

---

### Task 5: Avisos no Dashboard

**Files:**
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `incomeHint` (Task 3); `getClosings`, `getNomeExtrato` (Task 1); `getMonthEntries`.

- [ ] **Step 1: Implementar**

- Carregue `getNomeExtrato` junto do resto.
- **Card "{Mês anterior} ainda não foi fechado":** aparece se `month === today`, o mês anterior tem lançamentos e não tem fechamento. Use `getMonthEntries` do mês anterior e `getClosings(db, userId, [prev])`. O botão "Fechar mês" leva a `/fechamento?mes={prev}`.
- **Aviso de renda:** `const hint = incomeHint(entries, nome)`. Se não for `null`, mostra o texto das Global Constraints, com link "Ver Pix" para `/fechamento?mes={month}`.
- Os dois ficam entre o cabeçalho e o bloco "Saldo do mês", com estilo discreto (`Card` com borda, texto `text-sm`).

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit` e `npx eslint src` → limpos.

---

### Task 6: Relatórios só com meses fechados

**Files:**
- Modify: `src/app/(app)/relatorios/data.ts`
- Modify: `src/app/(app)/relatorios/page.tsx`
- Modify: `overview-section.tsx`, `categories-section.tsx`, `expenses-section.tsx`, `card-section.tsx`, `exportar/route.ts`

**Interfaces:**
- Consumes: `closedPeriod` (Task 3); `getClosings` (Task 1).
- Produces:
  - `loadPeriod(userId, meses)` envolvido em `cache` do React, devolvendo `{ periodo: MonthEntries (só fechados); cats; abertos: MonthKey[]; alterados: MonthKey[] }`.

- [ ] **Step 1: Implementar**

- `loadPeriod`: busca as entradas (como hoje) e `getClosings`, aplica `fillMonths` e depois `closedPeriod`.
- Seções:
  - toda conta que usava `meses` para alinhar séries, contar meses ou achar o último mês passa a usar `periodo.map((m) => m.mes)`;
  - médias dividem por `periodo.length`;
  - em `categories-section`, `fim` = último mês de `periodo`;
  - "Comprometido nas próximas faturas" (`getUnpaidInstallments`) e `InvestmentsSection` não mudam.
- `page.tsx`:
  - chama `loadPeriod` (com o `cache` não há busca dupla);
  - **sem nenhum mês fechado** (`periodo.length === 0`): estado vazio "Nenhum mês fechado neste período", com link "Fechar {mês anterior}" para `/fechamento`, no lugar da aba (exceto Investimentos, que continua aparecendo);
  - **com meses de fora:** aviso acima das abas, "Fora dos relatórios (ainda abertos): {lista}", com cada mês linkando para `/fechamento?mes=`;
  - **com alterados:** "⚠ Alterado depois do fechamento: {lista}", também com links.
- `exportar/route.ts`: usa o `periodo` filtrado. Se ele estiver vazio, responde `404` com o texto "Nenhum mês fechado neste período".

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` → limpos/PASS.

---

### Task 7: Verificação final e conferência do usuário

- [ ] **Step 1:** Run: `npx tsc --noEmit`, `npx eslint`, `npx vitest run` → tudo verde. Cole o resumo.
- [ ] **Step 2: Conferência manual (usuário, no dev server)**
  1. **Configurações:** salve "RODRIGGO ALVES AREBA". Nenhuma transação muda.
  2. **Relatórios:** com nenhum mês fechado, aparece "Nenhum mês fechado neste período".
  3. **`/fechamento?mes=2026-09`:**
     - no passo 2, marque R$ 1.800,00 e R$ 2.219,52 como Salário e os Pix pequenos como Transferência própria;
     - o rodapé mostra a renda do mês;
     - feche o mês.
  4. **Relatórios:** setembro entra, e o aviso lista os demais meses abertos.
  5. **Transações:** troque a categoria de um gasto de setembro. Relatórios mostram "⚠ Alterado depois do fechamento: setembro", e "Refechar" volta para Fechado.
  6. **Dashboard, novembro:** aparece o card "Outubro ainda não foi fechado". Importe um extrato com Pix seu: ele chega como Transferência própria, e o aviso "Você recebeu R$ X de você mesmo…" aparece até você marcar o salário.
