# Fase 4 — Fatura do cartão no Dashboard e em Transações — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Nenhum step faz commit: o usuário testa e commita.

**Goal:** Fazer Dashboard, card "Fatura do cartão" e Transações usarem a mesma lista de lançamentos do mês (extrato + parcelas da fatura que fecha no mês), para todo número do Dashboard ter uma lista correspondente em Transações.

**Architecture:** Uma lista pura de lançamentos (`src/domain/entries.ts`) é montada a partir de duas leituras finas do banco (`src/db/entries.ts`). O resumo do Dashboard (`summarizeSpending`), o card da fatura (`invoiceCard`) e a tela Transações (`filterEntries` + `entriesTotal`) consomem essa mesma lista. Nada muda no banco.

**Tech Stack:** Next.js 15 (App Router, server components/actions), Drizzle ORM + postgres-js, Vitest, lucide-react, sonner.

**Spec:** `docs/superpowers/specs/fase-4/2026-11-02-fase-4-cartao-no-dashboard-e-transacoes-design.md`

## Global Constraints

- **Não fazer commits.** Ao fim de cada task, deixar as mudanças no working tree e reportar o que mudou e como testar.
- **Não rodar `next dev`/`next build`** (o servidor do usuário usa a mesma `.next`). Verificação: `npx tsc --noEmit` (ignorar erros em `.next/`), `npx eslint src tests`, `npx vitest run`.
- **Mudanças não commitadas do usuário já no working tree** (`src/components/month-picker.tsx`, `currentMonth()` em `src/domain/month.ts`, mês padrão em `src/app/(app)/page.tsx` e `src/app/(app)/transacoes/page.tsx`, remoção de `month-pills.tsx`, `tests/domain/month.test.ts`): manter e construir em cima; não reverter nem alterar `MonthPicker`/`currentMonth`.
- Valores em centavos (inteiro). Datas em horário de parede UTC; exibir com `timeZone: "UTC"`.
- Toda consulta filtra por `user_id`. Sem migração de banco.
- Um cartão (PicPay, `BANCO` em `src/db/credit.ts`).
- Mês de um lançamento: conta pela data da transação; cartão pelo `invoices.mes` (mês de fechamento) da fatura da parcela; parcela cancelada (`cancelada_por_import_id` preenchido) nunca entra.
- Sinal: lançamento do cartão = −(valor da parcela): compra negativa, estorno positivo; tipo sempre `GASTO`.
- Textos exatos:
  - Card: `Fatura do cartão`; apoio `Paga · vence dd/mm/aaaa`, `Fechada · vence dd/mm/aaaa`, `Projetada · a fatura ainda não fechou`, `Nenhuma fatura neste mês`; valor sem fatura `—`; link `/transacoes?mes=AAAA-MM&origem=CARTAO`.
  - Linha do resumo: `Créditos e estornos`.
  - Etiquetas: `Compra no crédito`, `Estorno no crédito`, `Débito`, `k/n` (ex.: `9/10`).
  - Filtro: `Todas as origens`, `Conta`, `Cartão`; parâmetro `origem=CONTA|CARTAO`.
  - Total: `N lançamento(s) · <formatBRL(soma)>` (ex.: `64 lançamentos · -R$ 5.879,10`).

## Review Focus

- Parcela cancelada (projeção que não veio) não pode aparecer em Transações nem somar no card. Teste na Task 1 (`cancelled installments are left out`).
- Clique em "Sem categoria" (`categoria=none`) precisa trazer as linhas do cartão sem categoria, senão o total não fecha com o Dashboard. Teste na Task 1 (`'none' matches entries without category from both origins`).
- Mês com "pula compra" (categoria negativa): o total de Gastos, cada categoria e o card precisam fechar com as listas filtradas. Teste de consistência na Task 2.
- Estorno da fatura e a linha "CRÉDITOS E ESTORNOS NÃO IDENTIFICADOS" (sem categoria, negativa na fatura) aparecem positivos e com `Estorno no crédito`. Teste na Task 1 (`labels`).
- Editar a categoria numa linha do cartão precisa gravar na compra (`purchaseId`), nunca chamar a action de transação com o id da parcela. Garantido pelo tipo união da linha e conferido no Step 6 da Task 6.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/domain/entries.ts` (novo) | tipos de lançamento, montagem, filtros, total, etiquetas, `parseOrigin` |
| `src/domain/summary.ts` | `summarizeSpending` (categorias positivas + créditos) |
| `src/domain/invoice.ts` | tipo `InvoiceStatus` (movido de `db/credit.ts`) |
| `src/domain/invoice-card.ts` (novo) | valor, texto e link do card da fatura |
| `src/db/entries.ts` (novo) | `getMonthEntries`: lê extrato e parcelas do mês |
| `src/db/credit.ts` | `getInvoiceForMonth`; reexporta `InvoiceStatus`; perde `getInstallmentsForMonth` |
| `src/db/queries.ts` | perde `getTransactions` e `TransactionFilters` |
| `src/app/(app)/page.tsx` | Dashboard com a lista de lançamentos, card e linha de créditos |
| `src/app/(app)/transacoes/page.tsx`, `transaction-row.tsx` | filtro de origem, total, linhas do cartão |
| `src/app/(app)/cartao/purchase-category.tsx` | movido de `cartao/[faturaId]/`, usado também em Transações |

---

### Task 1: Lançamentos do mês (domínio)

**Files:**
- Create: `src/domain/entries.ts`
- Test: `tests/domain/entries.test.ts`

**Interfaces:**
- Consumes: `TxType` de `src/domain/picpay-parser.ts`.
- Produces:
  ```ts
  export type EntryOrigin = "CONTA" | "CARTAO";
  export type AccountRow = { id: string; dataHora: Date; descricao: string; valor: number; tipo: TxType;
    categoryId: string | null; formaPagamento: string | null };
  /** Parcela como gravada: valor positivo na compra, negativo no estorno. */
  export type CardRow = { installmentId: string; purchaseId: string; dataCompra: Date; descricao: string; valor: number;
    numero: number; parcelas: number; categoryId: string | null; tipo: "COMPRA" | "ESTORNO"; cancelada: boolean };
  type EntryBase = { id: string; data: Date; descricao: string; valor: number; tipo: TxType; categoryId: string | null };
  export type AccountEntry = EntryBase & { origem: "CONTA"; formaPagamento: string | null };
  export type CardEntry = EntryBase & { origem: "CARTAO"; purchaseId: string;
    parcela: { numero: number; total: number } | null; estorno: boolean };
  export type MonthEntry = AccountEntry | CardEntry;
  /** categoryId "none" = sem categoria. */
  export type EntryFilters = { categoryId?: string; tipo?: TxType; origem?: EntryOrigin };
  export function buildMonthEntries(account: AccountRow[], card: CardRow[]): MonthEntry[];
  export function filterEntries(entries: MonthEntry[], filters: EntryFilters): MonthEntry[];
  export function entriesTotal(entries: MonthEntry[]): number; // soma com sinal
  export function entryLabels(entry: MonthEntry): string[];
  export function parseOrigin(value: string | undefined): EntryOrigin | undefined;
  ```

- [ ] **Step 1: Write the failing tests** em `tests/domain/entries.test.ts`, com fábricas locais:
  ```ts
  const d = (iso: string) => new Date(iso);
  const conta = (over: Partial<AccountRow> = {}): AccountRow => ({ id: "t1", dataHora: d("2026-10-14T10:08:00Z"),
    descricao: "GOOGLE", valor: -3599, tipo: "GASTO", categoryId: "assin", formaPagamento: "Com cartão", ...over });
  const cartao = (over: Partial<CardRow> = {}): CardRow => ({ installmentId: "i1", purchaseId: "p1",
    dataCompra: d("2026-02-21T00:00:00Z"), descricao: "AMAZON BR", valor: 23088, numero: 9, parcelas: 10,
    categoryId: "setup", tipo: "COMPRA", cancelada: false, ...over });
  ```
  - `card installment becomes a negative expense with its purchase data`:
    ```ts
    expect(buildMonthEntries([], [cartao()])).toEqual([{ origem: "CARTAO", id: "i1", purchaseId: "p1",
      data: d("2026-02-21T00:00:00Z"), descricao: "AMAZON BR", valor: -23088, tipo: "GASTO", categoryId: "setup",
      parcela: { numero: 9, total: 10 }, estorno: false }]);
    ```
  - `account transaction keeps its sign, type and payment form`:
    ```ts
    expect(buildMonthEntries([conta()], [])).toEqual([{ origem: "CONTA", id: "t1", data: d("2026-10-14T10:08:00Z"),
      descricao: "GOOGLE", valor: -3599, tipo: "GASTO", categoryId: "assin", formaPagamento: "Com cartão" }]);
    ```
  - `refund from the invoice is positive and one-off purchases have no installment`:
    ```ts
    const [e] = buildMonthEntries([], [cartao({ descricao: "CREDITO PULA COMPRA", valor: -319900, numero: 1,
      parcelas: 1, tipo: "ESTORNO", categoryId: null })]);
    expect(e).toMatchObject({ valor: 319900, parcela: null, estorno: true, tipo: "GASTO" });
    ```
  - `cancelled installments are left out`: `expect(buildMonthEntries([], [cartao({ cancelada: true })])).toEqual([])`.
  - `sorted by date, newest first, then description`:
    ```ts
    const entries = buildMonthEntries(
      [conta({ id: "t1" }), conta({ id: "t2", descricao: "UBER", dataHora: d("2026-10-26T21:24:00Z") })],
      [cartao({ installmentId: "i1" }), cartao({ installmentId: "i2", descricao: "AIRBNB" })],
    );
    expect(entries.map((e) => e.id)).toEqual(["t2", "t1", "i2", "i1"]);
    ```
  - `describe("filterEntries")` sobre
    `buildMonthEntries([conta({ id: "t1", categoryId: "setup" }), conta({ id: "t2", tipo: "RECEITA", valor: 500000, categoryId: null, formaPagamento: null })], [cartao({ installmentId: "i1", categoryId: "setup" }), cartao({ installmentId: "i2", categoryId: null })])`,
    com `ids = (f) => filterEntries(entries, f).map((e) => e.id).sort()`:
    - `by category includes both origins` → `ids({ categoryId: "setup" })` = `["i1", "t1"]`
    - `'none' matches entries without category from both origins` → `ids({ categoryId: "none" })` = `["i2", "t2"]`
    - `card entries are expenses` → `ids({ tipo: "RECEITA" })` = `["t2"]`
    - `by origin` → `ids({ origem: "CARTAO" })` = `["i1", "i2"]`; `ids({ origem: "CONTA" })` = `["t1", "t2"]`
    - `combined filters` → `ids({ tipo: "GASTO", categoryId: "setup", origem: "CARTAO" })` = `["i1"]`
    - `no filter keeps everything` → `ids({})` = `["i1", "i2", "t1", "t2"]`
  - `entriesTotal is the signed sum`:
    ```ts
    const entries = buildMonthEntries([conta(), conta({ id: "t2", tipo: "RECEITA", valor: 10000 })],
      [cartao(), cartao({ installmentId: "i2", valor: -1000, numero: 1, parcelas: 1, tipo: "ESTORNO" })]);
    expect(entriesTotal(entries)).toBe(-3599 + 10000 - 23088 + 1000);
    expect(entriesTotal([])).toBe(0);
    ```
  - `labels`:
    ```ts
    const one = (a: AccountRow[], c: CardRow[]) => entryLabels(buildMonthEntries(a, c)[0]);
    expect(one([], [cartao()])).toEqual(["Compra no crédito", "9/10"]);
    expect(one([], [cartao({ numero: 1, parcelas: 1 })])).toEqual(["Compra no crédito"]);
    expect(one([], [cartao({ valor: -1098, numero: 1, parcelas: 1, tipo: "ESTORNO",
      descricao: "CRÉDITOS E ESTORNOS NÃO IDENTIFICADOS", categoryId: null })])).toEqual(["Estorno no crédito"]);
    expect(one([conta()], [])).toEqual(["Débito"]);
    expect(one([conta({ formaPagamento: "Com saldo" })], [])).toEqual([]);
    ```
  - `parseOrigin accepts only CONTA and CARTAO`: `"CONTA"` → `"CONTA"`, `"CARTAO"` → `"CARTAO"`, `"xyz"` e `undefined` → `undefined`.

- [ ] **Step 2: Run** `npx vitest run tests/domain/entries.test.ts` → FAIL (`Cannot find package '@/domain/entries'`).

- [ ] **Step 3: Implement** `src/domain/entries.ts` com as assinaturas acima. Cartão: `valor = -row.valor`, `tipo: "GASTO"`, `parcela` só quando `parcelas > 1`, `estorno = row.tipo === "ESTORNO"`. Ordem: `data` decrescente, empate por `descricao.localeCompare(…, "pt-BR")`. Etiqueta `Débito` quando `formaPagamento === "Com cartão"`.

- [ ] **Step 4: Run** `npx vitest run tests/domain/entries.test.ts` → PASS.

---

### Task 2: Resumo de gastos com créditos

**Files:**
- Modify: `src/domain/summary.ts`
- Test: `tests/domain/summary.test.ts`

**Interfaces:**
- Consumes: `buildMonthEntries`, `filterEntries`, `entriesTotal`, `CardRow` (Task 1) — só no teste.
- Produces:
  ```ts
  export type SpendingSummary = {
    /** Só categorias com gasto positivo, maior primeiro; percentual sobre a soma delas. */
    categorias: CategoryTotal[];
    /** Soma das categorias que ficaram negativas no mês (≤ 0). */
    creditos: number;
    /** Gastos do mês = soma de `categorias` + `creditos`. */
    total: number;
  };
  export function summarizeSpending(entries: { valor: number; tipo: TxType; categoryId: string | null }[],
    categories: { id: string; nome: string; cor: string }[]): SpendingSummary;
  ```
  `summarizeByCategory` e `installmentsAsTxs` continuam até a Task 5 (o Dashboard ainda os usa).

- [ ] **Step 1: Write the failing tests** num novo `describe("summarizeSpending")`, reaproveitando `cats` e `tx` do arquivo:
  - `sums only GASTO` → `summarizeSpending([tx(-1000, "alim"), tx(5000, "alim", "RECEITA"), tx(-9000, "alim", "MOVIMENTACAO")], cats)` é `{ categorias: [{ categoryId: "alim", nome: "Alimentação", cor: "#f00", total: 1000, percentual: 100 }], creditos: 0, total: 1000 }`.
  - `groups uncategorized and orders by total desc` e `percentages sum to ~100`: os mesmos dados e asserções dos testes de `summarizeByCategory`, sobre `.categorias`.
  - `a refund reduces its category` → `[tx(-1000, "alim"), tx(300, "alim")]` dá `categorias[0].total === 700`, `creditos === 0`, `total === 700`.
  - `a category left negative becomes a credit that reduces the total` → `[tx(-1000, "alim"), tx(-319900, "transp"), tx(319900, "transp"), tx(319900, "transp")]` dá `categorias.map((c) => c.categoryId)` = `["alim"]`, `categorias[0].percentual === 100`, `creditos === -319900`, `total === -318900`.
  - `empty input` → `{ categorias: [], creditos: 0, total: 0 }`.
  - `dashboard numbers match the filtered lists (month with 'pula compra')`, com
    `card = (id, descricao, valor, categoryId, tipo, numero = 1, parcelas = 1): CardRow => ({ installmentId: id, purchaseId: id, dataCompra: new Date("2026-09-15T00:00:00Z"), descricao, valor, numero, parcelas, categoryId, tipo, cancelada: false })`:
    ```ts
    const entries = buildMonthEntries(
      [
        { id: "t1", dataHora: new Date("2026-09-03T12:00:00Z"), descricao: "PIX MERCADO", valor: -10000, tipo: "GASTO", categoryId: "alim", formaPagamento: "Com saldo" },
        { id: "t2", dataHora: new Date("2026-09-05T11:16:00Z"), descricao: "Fatura PicPay Card", valor: -166155, tipo: "MOVIMENTACAO", categoryId: null, formaPagamento: "Com saldo" },
        { id: "t3", dataHora: new Date("2026-09-10T09:00:00Z"), descricao: "SALARIO", valor: 500000, tipo: "RECEITA", categoryId: null, formaPagamento: null },
      ],
      [
        card("i1", "AMAZONMKTPLC*SAMSUNGEL", 319900, "transp", "COMPRA"),
        card("i2", "AMAZONMKTPLC*SAMSUNGEL", -319900, "transp", "ESTORNO"),
        card("i3", "CREDITO PULA COMPRA", -319900, "transp", "ESTORNO"),
        card("i4", "GOOGLE", 2399, null, "COMPRA"),
        card("i5", "AMAZON BR", 23088, "alim", "COMPRA", 8, 10),
      ],
    );
    const resumo = summarizeSpending(entries, cats);
    expect(resumo.creditos).toBe(-319900);
    expect(resumo.total).toBe(-entriesTotal(filterEntries(entries, { tipo: "GASTO" })));
    for (const c of resumo.categorias) {
      expect(c.total).toBe(-entriesTotal(filterEntries(entries, { tipo: "GASTO", categoryId: c.categoryId ?? "none" })));
    }
    expect(-entriesTotal(filterEntries(entries, { origem: "CARTAO" }))).toBe(319900 - 319900 - 319900 + 2399 + 23088);
    ```

- [ ] **Step 2: Run** `npx vitest run tests/domain/summary.test.ts` → FAIL (`summarizeSpending` não exportado).

- [ ] **Step 3: Implement `summarizeSpending`** em `src/domain/summary.ts`: mesma soma por categoria e mesmo arredondamento de percentual de `summarizeByCategory`, com `creditos` = soma dos totais negativos e `total` = soma positiva + `creditos`. Extrair a parte comum para não duplicar a lógica.

- [ ] **Step 4: Run** `npx vitest run tests/domain/summary.test.ts` → PASS (testes antigos e novos).

---

### Task 3: Card da fatura (domínio)

**Files:**
- Modify: `src/domain/invoice.ts`, `src/db/credit.ts`
- Create: `src/domain/invoice-card.ts`
- Test: `tests/domain/invoice-card.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/domain/invoice.ts (movido de db/credit.ts; credit.ts passa a importar e reexportar)
  export type InvoiceStatus = "PAGA" | "FECHADA" | "PROJETADA";
  // src/domain/invoice-card.ts
  export type InvoiceCard = { value: string; hint: string; href: string | null };
  export function invoiceCard(invoice: { status: InvoiceStatus; vencimento: Date } | null, total: number, mes: MonthKey): InvoiceCard;
  ```

- [ ] **Step 1: Write the failing tests** (`formatBRL` de `@/domain/money` nos valores esperados):
  - `closed invoice` → `invoiceCard({ status: "FECHADA", vencimento: new Date(Date.UTC(2026, 10, 5)) }, 587910, "2026-10")` = `{ value: formatBRL(587910), hint: "Fechada · vence 05/11/2026", href: "/transacoes?mes=2026-10&origem=CARTAO" }`
  - `paid invoice` → `({ status: "PAGA", vencimento: new Date(Date.UTC(2026, 9, 5)) }, 725, "2026-09")` = `{ value: formatBRL(725), hint: "Paga · vence 05/10/2026", href: "/transacoes?mes=2026-09&origem=CARTAO" }`
  - `projected invoice` → `({ status: "PROJETADA", vencimento: new Date(Date.UTC(2026, 11, 5)) }, 75761, "2026-11")` = `{ value: formatBRL(75761), hint: "Projetada · a fatura ainda não fechou", href: "/transacoes?mes=2026-11&origem=CARTAO" }`
  - `no invoice` → `invoiceCard(null, 0, "2026-12")` = `{ value: "—", hint: "Nenhuma fatura neste mês", href: null }`

- [ ] **Step 2: Run** `npx vitest run tests/domain/invoice-card.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implement.** Mover `InvoiceStatus` para `src/domain/invoice.ts`; em `src/db/credit.ts`, `import type { InvoiceStatus } from "@/domain/invoice"` e `export type { InvoiceStatus } from "@/domain/invoice"` (`status-badge.tsx` continua importando de `@/db/credit`). Data do texto com `toLocaleDateString("pt-BR", { timeZone: "UTC" })`.

- [ ] **Step 4: Run** `npx vitest run tests/domain/invoice-card.test.ts` → PASS; `npx tsc --noEmit` sem erros fora de `.next/`.

---

### Task 4: Leitura do mês no banco

**Files:**
- Create: `src/db/entries.ts`
- Modify: `src/db/credit.ts`
- Test: `tests/db/invoice-import.test.ts` (novos casos; pulados sem `TEST_DATABASE_URL`)

**Interfaces:**
- Consumes: `buildMonthEntries`, `AccountRow`, `CardRow`, `MonthEntry` (Task 1); `monthRange` de `src/domain/month.ts`; `invoiceStatus`, `BANCO` de `src/db/credit.ts`.
- Produces:
  ```ts
  // src/db/entries.ts
  export async function getMonthEntries(db: Db, userId: string, mes: MonthKey): Promise<MonthEntry[]>;
  // src/db/credit.ts — fatura do cartão PicPay cujo mês de fechamento é `mes`
  export async function getInvoiceForMonth(db: Db, userId: string, mes: MonthKey): Promise<(Invoice & { status: InvoiceStatus }) | null>;
  ```

- [ ] **Step 1: Write the failing tests** em `tests/db/invoice-import.test.ts`, reaproveitando `importText`, `SEPTEMBER`, `OCTOBER` e `cleanup`:
  - Trocar o teste `dashboard ignores cancelled installments` para a nova leitura:
    ```ts
    const october = filterEntries(await getMonthEntries(db, userId, "2026-10"), { origem: "CARTAO" });
    expect(october.map((e) => e.valor).sort((a, b) => a - b)).toEqual([-23088, -14647]);
    ```
  - `month entries bring both origins and match the invoice total`: após importar setembro e inserir uma transação do usuário em `2026-09-10T12:00:00Z` (`valor: -1000`, `tipo: "GASTO"`, `origem: "CSV"`, `tipoOriginal: "Pix enviado"`, `descricao: "TESTE"`, `hashUnico: "e1"`) e outra de outro usuário no mesmo dia, `getMonthEntries(db, userId, "2026-09")` contém exatamente uma entrada `CONTA` (a do usuário) e `-entriesTotal(filterEntries(entries, { origem: "CARTAO" }))` é `725`. Limpeza inclui `transactions` dos dois usuários.
  - `getInvoiceForMonth finds the invoice by closing month` → após importar setembro, `getInvoiceForMonth(db, userId, "2026-09")` casa com `{ mes: "2026-09", status: "FECHADA" }`; `"2030-01"` → `null`; outro usuário → `null`.

- [ ] **Step 2: Run** `npx tsc --noEmit` → erros em `tests/db/invoice-import.test.ts` (`@/db/entries` não existe; `getInvoiceForMonth` não exportado). Sem `TEST_DATABASE_URL`, `npx vitest run tests/db/invoice-import.test.ts` só pula.

- [ ] **Step 3: Implement.** `getMonthEntries`: duas consultas em paralelo — transações do usuário com `data_hora` em `monthRange(mes)`; parcelas do usuário com `invoices.mes = mes` (join `invoices` e `credit_purchases`), trazendo `cancelada` = `cancelada_por_import_id is not null` (o filtro fica em `buildMonthEntries`); devolve `buildMonthEntries(...)`. `getInvoiceForMonth`: join com `credit_cards` filtrando `banco = BANCO`, `invoices.user_id` e `invoices.mes`; status via `invoiceStatus`.

- [ ] **Step 4: Run** `npx tsc --noEmit` sem erros fora de `.next/`; `npx vitest run` → tudo verde (testes de banco pulados).

---

### Task 5: Dashboard

**Files:**
- Modify: `src/app/(app)/page.tsx`, `src/domain/summary.ts`, `src/db/credit.ts`, `tests/domain/summary.test.ts`

**Interfaces:**
- Consumes: `getMonthEntries`, `getInvoiceForMonth` (Task 4); `summarizeSpending` (Task 2); `invoiceCard` (Task 3); `filterEntries`, `entriesTotal` (Task 1).

- [ ] **Step 1: Remover o código substituído:** `summarizeByCategory` e `installmentsAsTxs` (`src/domain/summary.ts`) com o `describe("summarizeByCategory")` e o teste `counts card installments and lets a refund reduce its category`; `getInstallmentsForMonth` (`src/db/credit.ts`). Os casos equivalentes estão em `summarizeSpending` (Task 2) e no teste de banco da Task 4.

- [ ] **Step 2: Dados do Dashboard** em `src/app/(app)/page.tsx`: carregar `getMonthEntries(db, userId, month)`, `getCategories(userId)` e `getInvoiceForMonth(db, userId, month)` em paralelo. `resumo = summarizeSpending(entries, categories)`; entradas = lançamentos `RECEITA`; `gastos = resumo.total`; `top = resumo.categorias[0]`; `cartao = invoiceCard(fatura, -entriesTotal(filterEntries(entries, { origem: "CARTAO" })), month)`. Manter `getAvailableMonths`, `currentMonth` e `MonthPicker` como estão.

- [ ] **Step 3: Card "Fatura do cartão".** Grade de stats vira `sm:grid-cols-2 lg:grid-cols-4`, com um quarto `Stat`: ícone `CreditCard` (lucide), `tone="expense"`, `label="Fatura do cartão"`, `value={cartao.value}`, `hint={cartao.hint}`. `Stat` ganha `href?: string | null`; com `href`, o card inteiro vira `Link` com o mesmo foco visível dos links de categoria (`focus-visible:ring-2 focus-visible:ring-ring`). O hint de Gastos usa `resumo.categorias.length`.

- [ ] **Step 4: Gastos por categoria.** Rosca e lista usam `resumo.categorias` (rosca com `total={gastos}`). Quando `resumo.creditos < 0`, a lista termina com um `<li>` não clicável: `Créditos e estornos` e `formatBRL(resumo.creditos)`. Mensagem "Nenhum gasto neste mês." só quando não há categorias **e** `creditos === 0`; a rosca só aparece com categorias.

- [ ] **Step 5: Verify.** `npx tsc --noEmit` (sem erros fora de `.next/`), `npx eslint src tests` e `npx vitest run` → limpos.

- [ ] **Step 6: Conferência manual (usuário, com o servidor dele):**
  - out/2026: card `R$ 5.879,10` com `Paga · vence 05/11/2026` (no banco a fatura de out/2026 está paga); categoria Setup `R$ 4.333,59`.
  - set/2026: card `R$ 7,25` com `Paga · vence 05/10/2026`.
  - nov/2026: card `R$ 757,61` com `Projetada · a fatura ainda não fechou`.
  - mês sem fatura (ex.: jan/2025): card `—`, `Nenhuma fatura neste mês`, sem clique.

---

### Task 6: Transações

**Files:**
- Move: `src/app/(app)/cartao/[faturaId]/purchase-category.tsx` → `src/app/(app)/cartao/purchase-category.tsx` (`git mv`; import das actions vira `./actions`; `[faturaId]/page.tsx` importa de `../purchase-category`)
- Modify: `src/app/(app)/transacoes/page.tsx`, `src/app/(app)/transacoes/transaction-row.tsx`, `src/db/queries.ts`

**Interfaces:**
- Consumes: `getMonthEntries` (Task 4); `filterEntries`, `entriesTotal`, `entryLabels`, `parseOrigin`, `MonthEntry` (Task 1); `PurchaseCategory({ purchaseId, descricao, categoryId, categories })`; `TIPO_LABEL`.
- Produces (`transaction-row.tsx`):
  ```ts
  export type RowData =
    | { origem: "CONTA"; id: string; data: string; descricao: string; valor: number; tipo: TxType;
        categoryId: string | null; labels: string[] }
    | { origem: "CARTAO"; id: string; purchaseId: string; data: string; descricao: string; valor: number;
        categoryId: string | null; labels: string[] };
  export function TransactionRow({ row, categories }: { row: RowData; categories: { id: string; nome: string }[] });
  ```

- [ ] **Step 1: Mover `PurchaseCategory`** como descrito em Files; `npx tsc --noEmit` continua limpo.

- [ ] **Step 2: Linha.** `TransactionRow` escolhe entre dois componentes internos pelo `row.origem` (hooks não ficam condicionais):
  - `CONTA`: comportamento atual (data `dd/mm hh:mm`, seletor de tipo, seletor de categoria com o diálogo de regra, cor do valor pelo tipo).
  - `CARTAO`: data `toLocaleDateString("pt-BR", { timeZone: "UTC" })`; tipo como texto `TIPO_LABEL.GASTO`; categoria com `<PurchaseCategory purchaseId={row.purchaseId} …>`; valor `text-expense` quando negativo e `text-income` quando positivo.
  - Etiquetas de `row.labels` ao lado da descrição, cada uma no estilo da etiqueta `Débito` atual.

- [ ] **Step 3: Página.** `searchParams` ganha `origem?: string`; `origem = parseOrigin(sp.origem)`. Trocar `getTransactions` por `getMonthEntries(db, userId, month)` + `filterEntries(entries, { categoryId, tipo, origem })`. Terceiro `SearchParamSelect`: `name="origem"`, `allLabel="Todas as origens"`, opções `{ value: "CONTA", label: "Conta" }` e `{ value: "CARTAO", label: "Cartão" }`. Com a lista não vazia, acima da tabela: `{n} {n === 1 ? "lançamento" : "lançamentos"} · {formatBRL(entriesTotal(lista))}`. Linhas: `key={`${e.origem}-${e.id}`}`, `data: e.data.toISOString()`, `labels: entryLabels(e)`.

- [ ] **Step 4: Remover** `getTransactions` e `TransactionFilters` de `src/db/queries.ts`, junto com os imports que ficarem sem uso.

- [ ] **Step 5: Verify.** `npx tsc --noEmit` (sem erros fora de `.next/`), `npx eslint src tests` e `npx vitest run` → limpos.

- [ ] **Step 6: Conferência manual (usuário):**
  - Clicar no card de out/2026 → Transações com `origem=CARTAO`; total `-R$ 5.879,10`; "AMAZON BR" com data `21/02/2026`, `Compra no crédito` e `9/10`.
  - set/2026, origem Cartão: total `-R$ 7,25`; "CREDITO PULA COMPRA" positivo, verde, `Estorno no crédito`.
  - Clicar em Setup no Dashboard de out/2026 → total `-R$ 4.333,59`, com as 4 linhas do cartão.
  - Mudar a categoria de uma linha do cartão → muda na compra (conferir no detalhe da fatura e nas outras parcelas); o diálogo fala em "compras sem categoria". Linhas da conta continuam editando tipo e categoria.
  - `?origem=xyz` → mostra todas as origens.
