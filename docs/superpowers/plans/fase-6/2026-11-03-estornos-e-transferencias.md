# Estornos e transferências próprias — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entradas mostram só renda de verdade e Gastos já descontam o que foi devolvido. Para isso entram um tipo novo **Estorno**, regras com tipo e sentido, e "Transferência própria" passa a ser Movimentação.

**Architecture:** O domínio puro (`src/domain/`) ganha `countsAsExpense` e `categoryTipo` em `tx-type.ts`, e todo cálculo de gasto passa por eles. As regras (`categorization.ts`) passam a carregar `tipo` e só casam com lançamentos do sentido compatível. No banco entram um valor novo no enum `tx_type` e a coluna `category_rules.tipo`, em duas migrações aplicadas em execuções separadas. A UI (Transações e Configurações) só consome essas funções.

**Tech Stack:** Next.js 15 (App Router, server actions), Drizzle ORM + Postgres (Supabase), Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/fase-6/2026-11-03-estornos-e-transferencias-design.md`

## Global Constraints

- **Sem passos de commit:** o usuário testa e commita.
- **Não rodar** `next dev`/`next build`: o usuário mantém o dev server dele. A verificação usa `npx tsc --noEmit`, `npx eslint` e `npx vitest run`.
- **Valores em centavos (inteiros), com sinal:** gasto negativo, estorno positivo.
- **Ordem e rótulos dos tipos:** `GASTO: "Gasto"`, `ESTORNO: "Estorno"`, `RECEITA: "Receita"`, `MOVIMENTACAO: "Movimentação"`.
- **Filtro de tipo em Transações:** a opção `GASTO` tem o rótulo exato **"Gastos e estornos"**.
- **Cor do valor de Estorno:** `text-income`.
- **Não existe categoria do tipo `ESTORNO`.** A categoria de um Estorno é de gasto (`categoryTipo("ESTORNO") === "GASTO"`).
- **Migrações:** a de schema (`0009`) é aplicada antes de a de dados (`0010`) ser gerada e aplicada. O Postgres não deixa usar um valor de enum novo na mesma transação em que ele foi criado.
- **Banco de testes:** `DATABASE_URL="$(grep '^TEST_DATABASE_URL=' .env.local | cut -d= -f2-)" npx drizzle-kit migrate` (bash). O `dotenv` não sobrescreve variável já definida.

## Review Focus

1. **Mesmo nome nos dois sentidos.** Com a regra "GESNER → Estorno · Alimentação", um Pix *enviado* ao Gesner continua Gasto e sem categoria. Teste na Task 4.
2. **Regra de transferência própria criada num Pix recebido.** Ela também converte os Pix *enviados* a mim mesmo que estão sem categoria, porque Movimentação vale nos dois sentidos. Teste `newRuleTargets` na Task 4.
3. **Card Gastos = lista que ele abre.** Para entradas com Gasto, Estorno e Receita, `-entriesTotal(filterEntries(e, { tipo: "GASTO" }))` precisa ser igual a `summarizeSpending(e).total`. Teste na Task 2.
4. **Compra do cartão com o mesmo nome de uma regra de Estorno.** A fatura ignora regras que não são `GASTO`. Teste na Task 4.
5. **Estorno antigo numa categoria de receita** (ex.: "Compra de Terceiros" depois que a linha virou Estorno). O seletor ainda mostra a categoria atual junto com as de gasto. Teste na Task 6.

---

### Task 1: Tipo Estorno no domínio

**Files:**
- Modify: `src/domain/picpay-parser.ts` (tipo `TxType`, `TIPOS`)
- Modify: `src/domain/tx-type.ts`
- Modify: `src/domain/guards.ts:3`
- Modify: `src/app/(app)/transacoes/transaction-row.tsx:16-20` (`VALOR_COLOR`)
- Test: `tests/domain/tx-type.test.ts`, `tests/domain/picpay-parser.test.ts`, `tests/domain/guards.test.ts`

**Interfaces:**
- Produces:
  - `type TxType = "GASTO" | "ESTORNO" | "RECEITA" | "MOVIMENTACAO"`
  - `countsAsExpense(tipo: TxType): boolean`
  - `categoryTipo(tipo: TxType): Exclude<TxType, "ESTORNO">`
  - `TIPO_LABEL` com Estorno
  - `CATEGORY_TIPOS: Exclude<TxType, "ESTORNO">[] = ["GASTO", "RECEITA", "MOVIMENTACAO"]`, todos em `tx-type.ts`

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/domain/tx-type.test.ts`:
- `"parseTipo accepts the four types"`: inclui `expect(parseTipo("ESTORNO")).toBe("ESTORNO")`.
- `"labels for the Tipo filter"`: espera `[["GASTO","Gasto"],["ESTORNO","Estorno"],["RECEITA","Receita"],["MOVIMENTACAO","Movimentação"]]`.
- Testes novos:

```ts
test("countsAsExpense: gasto e estorno contam; receita e movimentação não", () => {
  expect(["GASTO", "ESTORNO", "RECEITA", "MOVIMENTACAO"].map((t) => countsAsExpense(t as TxType))).toEqual([true, true, false, false]);
});
test("categoryTipo: estorno usa categorias de gasto", () => {
  expect(categoryTipo("ESTORNO")).toBe("GASTO");
  expect(categoryTipo("RECEITA")).toBe("RECEITA");
  expect(CATEGORY_TIPOS).toEqual(["GASTO", "RECEITA", "MOVIMENTACAO"]);
});
```

Em `tests/domain/picpay-parser.test.ts`, teste novo `"estorno e Pix devolvido viram ESTORNO"`. Ele parseia um CSV com o cabeçalho do PicPay e duas linhas:
- `2026-01-10,10:00,"Compra estornada","LOJA X","+R$ 20,00",`
- `2026-01-11,10:00,"Pix devolvido","Samuel","+R$ 35,00",`

e espera `rows.map(r => r.tipo)` igual a `["ESTORNO","ESTORNO"]`.

Em `tests/domain/guards.test.ts`: `sanitizeTxUpdate({ tipo: "ESTORNO" })` devolve `{ tipo: "ESTORNO" }`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/domain/tx-type.test.ts tests/domain/picpay-parser.test.ts tests/domain/guards.test.ts`
Expected: FAIL (`countsAsExpense` não exportado, rótulos sem Estorno, tipo `RECEITA` no lugar de `ESTORNO`, "Tipo inválido").

- [ ] **Step 3: Implementar**

- `TxType` ganha `"ESTORNO"`.
- `TIPOS` do parser: `"compra estornada": "ESTORNO"` e `"pix devolvido": "ESTORNO"`.
- `TIPO_LABEL` na ordem das Global Constraints. `countsAsExpense`, `categoryTipo` e `CATEGORY_TIPOS` em `tx-type.ts`.
- `guards.ts` `TIPOS` inclui `"ESTORNO"`.
- `VALOR_COLOR.ESTORNO = "text-income"`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/domain/tx-type.test.ts tests/domain/picpay-parser.test.ts tests/domain/guards.test.ts` → PASS.
Run: `npx tsc --noEmit` → limpo. Se algum `Record<TxType, …>` reclamar, complete com `ESTORNO`.

---

### Task 2: Cálculos de gasto contam estornos

**Files:**
- Modify: `src/domain/summary.ts:21`
- Modify: `src/domain/reports/expenses.ts:4`
- Modify: `src/domain/reports/evolution.ts:45`
- Modify: `src/domain/reports/categories.ts:28`
- Modify: `src/domain/entries.ts` (`buildMonthEntries` cartão, `filterEntries`)
- Modify: `src/app/(app)/page.tsx:64`
- Modify: `tests/domain/reports/helpers.ts` (`cartao`: `tipo: valor > 0 ? "ESTORNO" : "GASTO"`)
- Test: `tests/domain/summary.test.ts`, `tests/domain/entries.test.ts`, `tests/domain/reports/expenses.test.ts`, `tests/domain/reports/evolution.test.ts`, `tests/domain/reports/categories.test.ts`

**Interfaces:**
- Consumes: `countsAsExpense` (Task 1).
- Produces:
  - `CardEntry.tipo` é `"ESTORNO"` quando `estorno` é `true`.
  - `filterEntries(e, { tipo: "GASTO" })` inclui `ESTORNO`.

- [ ] **Step 1: Escrever os testes que falham**

`summary.test.ts`:
- `"estorno abate da categoria"`: `[tx(-8000,"alim"), tx(5000,"alim","ESTORNO")]` → categoria Alimentação com `total: 3000` e `total: 3000` no resumo.
- `"estorno maior que os gastos vira crédito, não fatia"`: `[tx(-1000,"alim"), tx(3000,"alim","ESTORNO"), tx(-500,"transp")]` → `categorias` só Transporte 500, `creditos: -2000`, `total: -1500`.

`entries.test.ts`:
- `"refund from the invoice is positive…"` passa a esperar também `tipo: "ESTORNO"`.
- Teste novo `"filtro GASTO inclui estornos e soma igual ao resumo"` (Review Focus 3): com entradas Gasto −8000 alim, Estorno +5000 alim, Receita +10000 e Movimentação −2000, o filtro `{ tipo: "GASTO" }` traz as duas primeiras, e `-entriesTotal(...)` é igual a `summarizeSpending(entries, cats).total` (3000).
- Teste novo `"filtro ESTORNO traz só estornos"`.

`reports/expenses.test.ts`: um Estorno de +5000 na mesma descrição de um gasto de −8000 não aparece em `topExpenses`, e em `topMerchants` o total da loja é 3000.

`reports/evolution.test.ts`: em `originSplit`, um Estorno da conta de +1000 reduz `conta` em 1000. Em `monthlyEvolution`, o Estorno não muda `entradas`.

`reports/categories.test.ts`: `categoriesInPeriod(…, "GASTO")` com Gasto −8000 e Estorno +5000 em alim → `total` 3000. Com `"RECEITA"`, o Estorno não aparece.

`reports/csv.test.ts`: se algum caso tiver estorno do cartão, a coluna Tipo passa a esperar `"Estorno"`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/domain/summary.test.ts tests/domain/entries.test.ts tests/domain/reports`
Expected: FAIL nos casos novos (estorno ignorado ou somado como receita).

- [ ] **Step 3: Implementar**

- Troque cada `tipo === "GASTO"` / `!== "GASTO"` listado em Files por `countsAsExpense`.
- Em `categoriesInPeriod`, o teste de inclusão vira `tipo === "GASTO" ? countsAsExpense(e.tipo) : e.tipo === tipo`.
- `filterEntries`: `!tipo || (tipo === "GASTO" ? countsAsExpense(e.tipo) : e.tipo === tipo)`.
- `buildMonthEntries`: `tipo: p.tipo === "ESTORNO" ? "ESTORNO" : "GASTO"`. `CardEntry.tipo` aceita esses dois.
- Dashboard: `gastosLink = entries.some((e) => countsAsExpense(e.tipo)) ? gastosHref : null`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/domain` → PASS. Run: `npx tsc --noEmit` → limpo.

---

### Task 3: Banco — enum `ESTORNO` e `category_rules.tipo`

**Files:**
- Modify: `src/db/schema.ts:13` (enum) e `categoryRules` (coluna `tipo`)
- Create: `drizzle/0009_estorno_e_regras_com_tipo.sql` (gerado e editado)
- Modify: `src/db/queries.ts` (`getRules`, `getRulesWithIds` selecionam `tipo`)
- Modify: `src/db/seed-user.ts:26-28`
- Modify: `src/app/(app)/transacoes/actions.ts:47-48`, `src/app/(app)/cartao/actions.ts:122-123`, `src/app/(app)/configuracoes/actions.ts:69-76` (inserts/updates de regra gravam `tipo`)
- Test: `tests/db/seed-user.test.ts`

**Interfaces:**
- Produces:
  - Coluna `categoryRules.tipo: TxType` NOT NULL.
  - `getRules(userId)` e `getRulesWithIds(userId)` devolvem `tipo`. O tipo `Rule` em si muda na Task 4. Até lá, `getRules` pode devolver o campo extra.

- [ ] **Step 1: Teste que falha**

Em `tests/db/seed-user.test.ts`, no teste existente de `ensureUserDefaults`, selecione `categoryRules.tipo` das regras do usuário e espere que todas sejam `"GASTO"`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsc --noEmit` → erro (`categoryRules.tipo` não existe).

- [ ] **Step 3: Schema e migração**

- `txType` = `["GASTO", "RECEITA", "MOVIMENTACAO", "ESTORNO"]`. A ordem no enum do banco não importa, e o novo valor vai no fim.
- `categoryRules.tipo: txType("tipo").notNull()`.
- `npx drizzle-kit generate --name estorno_e_regras_com_tipo`. Depois, edite o SQL gerado para conter exatamente:

```sql
ALTER TYPE "public"."tx_type" ADD VALUE 'ESTORNO';--> statement-breakpoint
ALTER TABLE "category_rules" ADD COLUMN "tipo" "tx_type";--> statement-breakpoint
UPDATE "category_rules" r SET "tipo" = c."tipo" FROM "categories" c WHERE c."id" = r."category_id";--> statement-breakpoint
ALTER TABLE "category_rules" ALTER COLUMN "tipo" SET NOT NULL;
```

- [ ] **Step 4: Gravar `tipo` em quem insere regra**

- `seed-user.ts`: `tipo` = tipo da categoria. Use `returning` com `tipo` e um mapa `nome → { id, tipo }`.
- `createRuleFromTransaction`: `tipo: tx.tipo`. A transação já é lida com `tipo`.
- `createRuleFromPurchaseAction`: `tipo: "GASTO"`.
- `upsertRule`: por enquanto, `tipo` = tipo da categoria escolhida. A Task 7 troca isso por um tipo informado.
- `getRules` e `getRulesWithIds` selecionam `tipo: categoryRules.tipo`.

- [ ] **Step 5: Aplicar e verificar**

- Run: `npx drizzle-kit check` → sem erros.
- Run: migrate no banco de testes (comando nas Global Constraints) e depois `npx drizzle-kit migrate` (dev) → sem erro.
- Run: `npx tsc --noEmit` → limpo. Run: `npx vitest run tests/db` → PASS.

---

### Task 4: Regras com tipo e sentido

**Files:**
- Modify: `src/domain/categorization.ts`
- Modify: `src/domain/import-plan.ts`
- Modify: `src/domain/invoice-import-plan.ts:1,135`
- Modify: `src/app/(app)/transacoes/actions.ts` (`createRuleFromTransaction`)
- Modify: `src/app/(app)/cartao/actions.ts:128`
- Test: `tests/domain/categorization.test.ts`, `tests/domain/import-plan.test.ts`, `tests/domain/invoice-import-plan.test.ts`

**Interfaces:**
- Consumes: `TxType` (Task 1); `getRules` com `tipo` (Task 3).
- Produces, em `categorization.ts`:
  - `type Rule = { padrao: string; categoryId: string; tipo: TxType }`
  - `type RuleTarget = { descricao: string; valor: number; tipo: TxType }`
  - `ruleApplies(rule: Rule, row: RuleTarget): boolean`
  - `matchRule(row: RuleTarget, rules: Rule[]): Rule | null`
  - `newRuleTargets(rows: (RuleTarget & { id: string })[], rule: Rule): string[]`
  - `matchPurchaseCategory(descricao: string, rules: Rule[]): string | null`
  - `ruleInputError(tipo: unknown, category: { tipo: TxType } | undefined): string | null`
  - `matchCategory` deixa de existir.

**Semântica de `ruleApplies`** (decidida na spec, seção 4). Todas as condições precisam valer:
1. O texto normalizado da descrição contém o padrão normalizado (não vazio).
2. Sentido: `GASTO` → `valor < 0`; `RECEITA`/`ESTORNO` → `valor > 0`; `MOVIMENTACAO` → qualquer.
3. Se `row.tipo` for `MOVIMENTACAO` ou `ESTORNO`, `rule.tipo === row.tipo`.

`matchRule` devolve, entre as regras aplicáveis, a de padrão normalizado mais longo. `matchPurchaseCategory` considera só regras `tipo === "GASTO"`, ignora sentido e devolve o `categoryId` da de padrão mais longo.

`ruleInputError` devolve:
- `"Tipo inválido"` se o tipo não estiver em `TIPO_LABEL`;
- `"Escolha uma categoria"` sem categoria;
- `"A categoria não combina com o tipo"` se `categoryTipo(tipo) !== category.tipo`;
- senão `null`.

- [ ] **Step 1: Escrever os testes que falham**

`categorization.test.ts`: reescreva o `describe("matchCategory")` como `describe("matchRule")`, com as regras ganhando `tipo: "GASTO"` e as linhas `valor: -100, tipo: "GASTO"`. Os três testes existentes continuam: o mais longo vence, case/acento, nenhuma casa. Acrescente:

```ts
const gesner = { padrao: "GESNER", categoryId: "alim", tipo: "ESTORNO" as const };
const eu = { padrao: "RODRIGGO ALVES AREBA", categoryId: "transf", tipo: "MOVIMENTACAO" as const };
test("regra de estorno só casa com dinheiro que entra (Review Focus 1)", () => {
  expect(matchRule({ descricao: "Gesner Borges", valor: 5000, tipo: "RECEITA" }, [gesner])).toBe(gesner);
  expect(matchRule({ descricao: "Gesner Borges", valor: -5000, tipo: "GASTO" }, [gesner])).toBeNull();
});
test("movimentação casa nos dois sentidos", () => {
  expect(matchRule({ descricao: "RODRIGGO ALVES AREBA", valor: 300000, tipo: "RECEITA" }, [eu])).toBe(eu);
  expect(matchRule({ descricao: "RODRIGGO ALVES AREBA", valor: -200000, tipo: "GASTO" }, [eu])).toBe(eu);
});
test("linha estorno/movimentação do parser só aceita regra do mesmo tipo", () => {
  const receita = { padrao: "SAMUEL", categoryId: "terc", tipo: "RECEITA" as const };
  expect(matchRule({ descricao: "Samuel", valor: 3500, tipo: "ESTORNO" }, [receita])).toBeNull();
  expect(matchRule({ descricao: "Cofrinho X", valor: -100, tipo: "MOVIMENTACAO" }, [{ ...eu, padrao: "COFRINHO", tipo: "GASTO" }])).toBeNull();
});
test("o mais longo vence só entre as compatíveis", () => {
  const longa = { padrao: "GESNER BORGES", categoryId: "lazer", tipo: "GASTO" as const };
  expect(matchRule({ descricao: "Gesner Borges", valor: 5000, tipo: "RECEITA" }, [gesner, longa])).toBe(gesner);
});
```

O `describe("newRuleTargets")` passa a usar linhas com `valor`:

```ts
const rows = [
  { id: "g1", descricao: "MARIA SILVA", valor: -100, tipo: "GASTO" as TxType },
  { id: "r1", descricao: "MARIA SILVA", valor: 100, tipo: "RECEITA" as TxType },
  { id: "g2", descricao: "JOAO SOUZA", valor: -100, tipo: "GASTO" as TxType },
];
// gasto → ["g1"]; receita → ["r1"]; estorno → ["r1"]
test("regra de movimentação pega os dois sentidos (Review Focus 2)", () => {
  expect(newRuleTargets(rows, { padrao: "MARIA SILVA", categoryId: "transf", tipo: "MOVIMENTACAO" })).toEqual(["g1", "r1"]);
});
```

`describe("matchPurchaseCategory")`, teste `"ignora regras que não são de gasto (Review Focus 4)"`:
- `matchPurchaseCategory("GESNER LTDA", [gesner])` → `null`;
- com `{ padrao: "GESNER", categoryId: "compras", tipo: "GASTO" }` → `"compras"`.

`describe("ruleInputError")`, os quatro retornos:
- `("XYZ", cat)` → `"Tipo inválido"`
- `("ESTORNO", undefined)` → `"Escolha uma categoria"`
- `("ESTORNO", { tipo: "RECEITA" })` → `"A categoria não combina com o tipo"`
- `("ESTORNO", { tipo: "GASTO" })` → `null`

`import-plan.test.ts`:
- As regras ganham `tipo: "GASTO"`.
- Teste novo `"linha casada recebe tipo e categoria da regra"`: uma linha `row("Gesner Borges","RECEITA","h6")` com a regra `{ padrao: "GESNER", categoryId: "alim", tipo: "ESTORNO" }` → `{ tipo: "ESTORNO", categoryId: "alim" }`.
- Teste novo `"movimentação sem regra do mesmo tipo usa a categoria padrão"`: o Cofrinho continua `"mov"`, mesmo com uma regra `GASTO` de padrão "COFRINHO".

`invoice-import-plan.test.ts`: as regras existentes ganham `tipo: "GASTO"`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/domain/categorization.test.ts tests/domain/import-plan.test.ts tests/domain/invoice-import-plan.test.ts`
Expected: FAIL (`matchRule` não exportado).

- [ ] **Step 3: Implementar o domínio**

- Funções em `categorization.ts` conforme a semântica acima.
- `buildImportPlan`:
  - `const rule = matchRule(row, rules)`;
  - `categoryId = rule?.categoryId ?? (row.tipo === "MOVIMENTACAO" ? categoriaPorTipo.MOVIMENTACAO : null)`;
  - `tipo = rule?.tipo ?? row.tipo`, gravado no `PlannedRow`.
- `invoice-import-plan.ts` usa `matchPurchaseCategory(line.descricao, rules)`.

- [ ] **Step 4: Ligar as actions**

- `createRuleFromTransaction`:
  - a regra é `{ padrao: tx.descricao, categoryId, tipo: tx.tipo }`;
  - a consulta das sem categoria seleciona `id, descricao, valor, tipo`;
  - os alvos vêm de `newRuleTargets(uncategorized, rule)`;
  - o `update` grava `{ categoryId, tipo: rule.tipo }`.
- `createRuleFromPurchaseAction`: `matchPurchaseCategory(p.descricao, [rule])`.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/domain` → PASS. Run: `npx tsc --noEmit` → limpo (sem referências a `matchCategory`).

---

### Task 5: Migração de dados e categoria padrão

**Files:**
- Modify: `src/domain/defaults.ts:17`
- Create: `drizzle/0010_estornos_e_transferencia_propria.sql` (custom)
- Test: `tests/domain/defaults.test.ts`, `tests/db/seed-user.test.ts`

**Interfaces:**
- Consumes: enum com `ESTORNO` já aplicado no banco (Task 3).

- [ ] **Step 1: Teste que falha**

Em `defaults.test.ts`: `DEFAULT_CATEGORIES.find(c => c.nome === "Transferência própria")?.tipo` é `"MOVIMENTACAO"`.

No `seed-user.test.ts`, a mesma conferência sobre as categorias gravadas.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/domain/defaults.test.ts` → FAIL (`"RECEITA"`).

- [ ] **Step 3: Implementar**

- `defaults.ts`: "Transferência própria" com `tipo: "MOVIMENTACAO"`.
- `npx drizzle-kit generate --custom --name estornos_e_transferencia_propria`, com o conteúdo:

```sql
-- "Transferência própria" deixa de ser receita: dinheiro entre contas próprias não é entrada nem gasto.
UPDATE "categories" SET "tipo" = 'MOVIMENTACAO' WHERE "nome" = 'Transferência própria' AND "tipo" = 'RECEITA';--> statement-breakpoint
UPDATE "transactions" t SET "tipo" = 'MOVIMENTACAO' FROM "categories" c
WHERE t."category_id" = c."id" AND c."nome" = 'Transferência própria' AND t."tipo" = 'RECEITA';--> statement-breakpoint
UPDATE "category_rules" r SET "tipo" = 'MOVIMENTACAO' FROM "categories" c
WHERE r."category_id" = c."id" AND c."nome" = 'Transferência própria';--> statement-breakpoint
-- Compra estornada e Pix devolvido são estornos; categoria de receita não serve para estorno.
UPDATE "transactions" SET "category_id" = NULL
WHERE "tipo_original" IN ('Compra estornada', 'Pix devolvido') AND "tipo" = 'RECEITA'
  AND "category_id" IN (SELECT "id" FROM "categories" WHERE "tipo" <> 'GASTO');--> statement-breakpoint
UPDATE "transactions" SET "tipo" = 'ESTORNO'
WHERE "tipo_original" IN ('Compra estornada', 'Pix devolvido') AND "tipo" = 'RECEITA';
```

- [ ] **Step 4: Aplicar e verificar**

- Run: `npx drizzle-kit check` → sem erros.
- Run: migrate no banco de testes, depois `npx drizzle-kit migrate` (dev) → sem erro. Essa é a segunda execução, separada da Task 3.
- Run: `npx vitest run tests/domain/defaults.test.ts tests/db` → PASS.
- No dev, uma consulta somente leitura confirma:
  - zero transações com `tipo_original` em ('Compra estornada','Pix devolvido') e `tipo = 'RECEITA'`;
  - "Transferência própria" com tipo `MOVIMENTACAO`.

---

### Task 6: Transações — seletores, filtro e linha do cartão

**Files:**
- Modify: `src/domain/category-options.ts`
- Modify: `src/domain/tx-type.ts` (`tipoFilterOptions`)
- Modify: `src/app/(app)/transacoes/page.tsx:69` e montagem das linhas do cartão (~linha 125)
- Modify: `src/app/(app)/transacoes/transaction-row.tsx` (`RowData` do cartão com `tipo`; `CardEntryRow` mostra `TIPO_LABEL[row.tipo]`)
- Test: `tests/domain/category-options.test.ts`, `tests/domain/tx-type.test.ts`

**Interfaces:**
- Consumes: `categoryTipo` (Task 1); `CardEntry.tipo` (Task 2).
- Produces:
  - `categoriesForType(categories, tipo, currentId)` filtra por `c.tipo === categoryTipo(tipo)`. A assinatura não muda.
  - `tipoFilterOptions(): { value: TxType; label: string }[]`

- [ ] **Step 1: Escrever os testes que falham**

`category-options.test.ts`:
- `"estorno lista as categorias de gasto"`: `categoriesForType(cats, "ESTORNO", null)` é igual a `categoriesForType(cats, "GASTO", null)`.
- `"estorno mantém a categoria de receita atual (Review Focus 5)"`: com `currentId` de uma categoria `RECEITA`, ela aparece junto com as de gasto.
- `"filtro com tipo estorno mostra categorias de gasto"`, via `categoryFilterOptions(cats, "ESTORNO", undefined)`.

`tx-type.test.ts`: `tipoFilterOptions()` é igual a

```ts
[{ value: "GASTO", label: "Gastos e estornos" }, { value: "ESTORNO", label: "Estorno" }, { value: "RECEITA", label: "Receita" }, { value: "MOVIMENTACAO", label: "Movimentação" }]
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/domain/category-options.test.ts tests/domain/tx-type.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

- `categoriesForType` usa `categoryTipo(tipo)`.
- `tipoFilterOptions` em `tx-type.ts`.
- `transacoes/page.tsx` usa `tipoFilterOptions()` no seletor de tipo. As linhas do cartão recebem `tipo: e.tipo`.
- `CardEntryRow` mostra `TIPO_LABEL[row.tipo]`.

O seletor de tipo da linha da conta já lista Estorno via `TIPO_LABEL`. O de categoria já usa `categoriesForType`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/domain` → PASS. Run: `npx tsc --noEmit` e `npx eslint src` → limpos.

---

### Task 7: Configurações — regras com tipo; categorias sem Estorno

**Files:**
- Modify: `src/app/(app)/configuracoes/actions.ts` (`TIPOS` → `CATEGORY_TIPOS`; `upsertRule` recebe `tipo`)
- Modify: `src/app/(app)/configuracoes/page.tsx` (passa `tipo` das categorias para as regras)
- Modify: `src/app/(app)/configuracoes/rules-section.tsx`
- Modify: `src/app/(app)/configuracoes/categories-section.tsx:23` (seletor de tipo só com `CATEGORY_TIPOS`)

**Interfaces:**
- Consumes: `ruleInputError`, `categoriesForType`, `CATEGORY_TIPOS`, `TIPO_LABEL`.
- Produces:
  - `upsertRule(data: { id?: string; padrao: string; categoryId: string; tipo: TxType }): Promise<{ error?: string }>`

- [ ] **Step 1: Action**

- `upsertCategory` valida com `CATEGORY_TIPOS`, o que recusa `ESTORNO`.
- `upsertRule`:
  - busca a categoria com `tipo`;
  - `const err = ruleInputError(data.tipo, cat)`; se houver, retorna `{ error: err }`;
  - grava `padrao, categoryId, tipo`.

O texto vazio continua dando "Informe o texto da regra". A lógica de validação já foi testada na Task 4.

- [ ] **Step 2: Formulário e lista**

- `RuleForm` ganha um `Select` de tipo antes da categoria. As opções vêm de `TIPO_LABEL`, e o rascunho novo começa em `"GASTO"`.
- A lista de categorias usa `categoriesForType(categories, draft.tipo, draft.categoryId || null)`.
- Trocar o tipo para um incompatível com a categoria atual limpa `categoryId`.
- O item da lista mostra: `contém <strong>{padrao}</strong> → {TIPO_LABEL[tipo]} · {nome da categoria}`.
- `Option` passa a ter `tipo`. `page.tsx` passa `{ id, nome, tipo }`.
- O seletor de tipo de `categories-section.tsx` usa `CATEGORY_TIPOS.map(t => ({ value: t, label: TIPO_LABEL[t] }))`.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` e `npx eslint src` → limpos. Run: `npx vitest run` → PASS.

---

### Task 8: Verificação final e conferência do usuário

- [ ] **Step 1:** Run: `npx tsc --noEmit`, `npx eslint`, `npx vitest run` (com `TEST_DATABASE_URL`) → tudo verde. Cole o resumo da saída.
- [ ] **Step 2: Conferência manual (usuário, no dev server dele)**
  1. **Transações, jan/2026:** o "Pix devolvido" do Samuel aparece como Estorno. Num Pix de "RODRIGGO ALVES AREBA" sem categoria, troque o tipo para Movimentação e a categoria para Transferência própria, e aceite a regra. A mensagem diz quantas foram aplicadas (~36). O Pix *enviado* de março (−2.000) também virou Movimentação.
  2. **Dashboard, jan/2026:** Entradas ≈ R$ 4.237 (salário 3.086,48 + ticket 1.125 + R$ 26 de "Compra de Terceiros" ainda como Receita), não mais R$ 6.392. Clique em Gastos: a lista ("Gastos e estornos") soma o mesmo valor do card.
  3. **Gesner:** troque um Pix recebido do Gesner para Estorno e escolha Alimentação. A categoria de gasto diminui no Dashboard e em Relatórios.
  4. **Configurações → Regras:** crie "GESNER → Estorno · Alimentação". A lista mostra o tipo. Criar Estorno com categoria de receita dá erro. Em Categorias, o seletor de tipo não oferece Estorno.
  5. **Relatórios:** Entradas do período caem, e o CSV exportado mostra "Estorno" na coluna Tipo.
