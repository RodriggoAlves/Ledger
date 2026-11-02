# Fase 2 — Importações, cartão de crédito e faturas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Nenhum step faz commit: o usuário testa e commita.

**Goal:** Entregar a Fase 2 da spec: histórico e exclusão de importações (4.1) e cartão de crédito com compras parceladas, conversão de transações e faturas (5).

**Architecture:** Regras puras em `src/domain/` (fatura, parcelas, período) testadas sem banco. Operações de banco em `src/db/*.ts` recebendo `Db` como parâmetro (padrão de `src/db/seed-user.ts`), testadas com `TEST_DATABASE_URL`. Server actions só autenticam (`requireUserId()`), validam entrada, chamam essas funções e revalidam. UI no padrão atual (server components + componentes cliente pequenos, `src/components/ui`).

**Tech Stack:** Next.js 15 (App Router, server actions), Drizzle ORM + drizzle-kit + postgres-js, Supabase (RLS), Vitest, lucide-react, sonner.

**Spec:** `docs/superpowers/specs/geral/2026-11-01-financas-design.md` — seções 4.1, 5, 7 (telas) e 9 (testes).

## Global Constraints

- **Não fazer commits.** O usuário testa antes de commitar; ao fim de cada task, deixar as mudanças no working tree e reportar o que mudou e como testar.
- Valores sempre em centavos (inteiro). Datas de compra/transação são "horário de parede" em UTC (ver `src/domain/month.ts`): usar `getUTC*` e `timeZone: "UTC"` ao exibir.
- Toda consulta filtra por `user_id` do usuário autenticado, além do RLS. Toda tabela nova recebe `ENABLE ROW LEVEL SECURITY` na migração (como `drizzle/0001_enable_rls.sql`).
- Operações que mexem em mais de uma tabela rodam em `db.transaction`.
- Um cartão por usuário (spec fala em "o cartão").
- Fora do escopo (spec 5): juros, rotativo, anuidade, estornos, limite. Fora do escopo (spec 4.1): excluir transações avulsas, lixeira, editar importação.
- Textos exatos da spec:
  - Confirmação de exclusão: `Excluir a importação '<arquivo>'? <N> transações de <período> serão apagadas. Essa ação não pode ser desfeita.` — sem transações: `Excluir a importação '<arquivo>'? Ela não tem transações. Essa ação não pode ser desfeita.`
  - Sucesso: `Importação excluída: <N> transações apagadas` · Erro: `Importação não encontrada`
  - Bloqueio: `Esta importação tem compras em faturas pagas. Desfaça a conversão delas antes de excluir.`
  - Pergunta de parcelas: `Quantas parcelas já foram pagas?` · Botão da fatura: `Marcar como paga`
- Decisão deste plano (a spec não fixa): no dashboard, cada parcela conta como gasto no **mês de fechamento da sua fatura**, na categoria da compra.

## Review Focus

- Importação de outro usuário ou id malformado → "Importação não encontrada", nada apagado. Testes nas Tasks 1 e 2.
- Compra no dia exato do fechamento, em 31/12 (virada de ano) e fechamento dia 31 em fevereiro → fatura e datas corretas. Testes na Task 5.
- Parcelas que não dividem exato (ex.: R$ 100,00 em 3) → soma das parcelas = total, sobra na 1ª. Teste na Task 5.
- "Parcelas já pagas" maior que o nº de parcelas ou negativo → recusado com erro claro, nada salvo. Teste na Task 6.
- Converter duas vezes a mesma transação, ou converter RECEITA/MOVIMENTACAO → recusado. Teste na Task 6.

---

### Task 1: Funções de banco `listImports` e `deleteImport`

**Files:**
- Create: `src/db/imports.ts`
- Test: `tests/db/imports.test.ts`

**Interfaces:**
- Consumes: `Db` de `src/db/client.ts`; tabelas `imports`, `transactions` de `src/db/schema.ts`.
- Produces:
  ```ts
  export type ImportSummary = {
    id: string;
    nomeArquivo: string;
    criadoEm: Date;
    transacoes: number;          // count atual de transactions com esse import_id
    inicio: Date | null;         // min(data_hora); null se nenhuma transação
    fim: Date | null;            // max(data_hora)
  };
  export async function listImports(db: Db, userId: string): Promise<ImportSummary[]>;
  /** null se a importação não existe ou não é do usuário. */
  export async function deleteImport(db: Db, userId: string, importId: string): Promise<{ apagadas: number } | null>;
  ```

- [ ] **Step 1: Write the failing tests** em `tests/db/imports.test.ts`, no mesmo formato de `tests/db/seed-user.test.ts` (`config({ path: ".env.local" })`, `describe.skipIf(!url)`, `timeout: 30_000`, `randomUUID()` para usuários, limpeza no `finally` apagando `transactions` e `imports` dos usuários de teste). Helper local `seedImport(db, userId, nome, rows: {dataHora: Date; hash: string; origem?: "CSV" | "MANUAL"}[])` que insere em `imports` e `transactions` (valor `-1000`, tipo `GASTO`, `tipoOriginal: "Compra realizada"`, `descricao: "TESTE"`).

  Testes:
  - `lists imports newest first with count and period` — duas importações (a segunda criada depois, `criadoEm` explícito); a primeira com transações em 2026-09-03 e 2026-09-20. Espera `list[0].nomeArquivo` = a segunda; para a primeira: `transacoes === 2`, `inicio` = 2026-09-03, `fim` = 2026-09-20.
  - `lists an import with no transactions` — importação sem linhas → `transacoes === 0`, `inicio === null`, `fim === null`.
  - `deletes only the import's transactions` — usuário com importação A (2 transações), importação B (1 transação) e 1 transação `MANUAL` com `importId: null`. `deleteImport(A)` → `{ apagadas: 2 }`; restam 2 transações do usuário (B + manual); registro A não existe mais em `imports`; B continua.
  - `keeps category rules` — cria uma `category_rules` para o usuário (com uma categoria), exclui a importação, regra continua existindo.
  - `does not delete another user's import` — importação do usuário X; `deleteImport(db, userY, idDeX)` → `null`; transações de X intactas.
  - `returns null when import does not exist` — `deleteImport(db, user, randomUUID())` → `null`.
  - `reimport after delete inserts rows again` — insere transação com `hash: "h1"`, exclui a importação, insere de novo transação com `hash: "h1"` para o mesmo usuário via `onConflictDoNothing` → retorna 1 linha inserida.

- [ ] **Step 2: Run tests to verify they fail**

  Run: `npx vitest run tests/db/imports.test.ts`
  Expected: FAIL com "Cannot find module '@/db/imports'" (com `TEST_DATABASE_URL` definido; sem ele os testes são pulados — defina antes de seguir).

- [ ] **Step 3: Implement `listImports` e `deleteImport` em `src/db/imports.ts`**

  `listImports`: `select` de `imports` com `leftJoin(transactions, eq(transactions.importId, imports.id))`, `count(transactions.id)`, `min/max(transactions.dataHora)`, `where imports.userId = userId`, `groupBy(imports.id)`, `orderBy(desc(imports.criadoEm))`. Converter `count` para `number`.

  `deleteImport`: dentro de `db.transaction`: buscar a importação por `id` **e** `userId`; se não houver, retornar `null`. Apagar `transactions` com `importId = id AND userId = userId` (`returning({ id })` para contar), depois apagar o registro em `imports`. Retornar `{ apagadas }`.

- [ ] **Step 4: Run tests to verify they pass**

  Run: `npx vitest run tests/db/imports.test.ts`
  Expected: 7 passed


### Task 2: Server action `deleteImportAction`

**Files:**
- Modify: `src/app/(app)/importar/actions.ts`
- Modify: `src/domain/guards.ts` (adicionar `isUuid`)
- Test: `tests/domain/guards.test.ts`

**Interfaces:**
- Consumes: `deleteImport(db, userId, importId)` da Task 1; `requireUserId()` de `@/lib/auth`; `db` de `@/db/client`.
- Produces:
  ```ts
  // src/domain/guards.ts
  export function isUuid(value: string): boolean;
  // src/app/(app)/importar/actions.ts
  export async function deleteImportAction(importId: string): Promise<{ apagadas?: number; error?: string }>;
  ```

- [ ] **Step 1: Write the failing test** em `tests/domain/guards.test.ts`:
  ```ts
  test("isUuid accepts a v4 uuid and rejects other strings", () => {
    expect(isUuid("3f2b8a6e-4c1d-4e9a-9b7f-2a1c0d5e6f70")).toBe(true);
    expect(isUuid("abc")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("3f2b8a6e-4c1d-4e9a-9b7f-2a1c0d5e6f70; drop table")).toBe(false);
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `npx vitest run tests/domain/guards.test.ts`
  Expected: FAIL — `isUuid` não exportado.

- [ ] **Step 3: Implement `isUuid` (regex de UUID, case-insensitive, ancorada) e `deleteImportAction`**

  `deleteImportAction`: `requireUserId()`; se `!isUuid(importId)` → `{ error: "Importação não encontrada" }`; senão chama `deleteImport`; `null` → mesmo erro; sucesso → `revalidatePath("/", "layout")` e `{ apagadas }`. Exceções inesperadas: `console.error` e `{ error: "Não foi possível excluir a importação" }`.

- [ ] **Step 4: Run tests and typecheck**

  Run: `npx vitest run tests/domain/guards.test.ts && npx tsc --noEmit`
  Expected: PASS, sem erros de tipo.


### Task 3: Histórico na tela Importar com confirmação

**Files:**
- Create: `src/app/(app)/importar/import-history.tsx` (server component)
- Create: `src/app/(app)/importar/delete-import-button.tsx` (client component)
- Create: `src/domain/period.ts`
- Test: `tests/domain/period.test.ts`
- Modify: `src/app/(app)/importar/page.tsx`

**Interfaces:**
- Consumes: `listImports`, `ImportSummary` (Task 1); `deleteImportAction` (Task 2); `db`; `Dialog*` de `@/components/ui/dialog`; `Button`, `Card`; `toast` de `sonner`.
- Produces:
  ```ts
  // src/domain/period.ts — datas em "horário de parede" UTC, como em month.ts
  export function formatPeriod(inicio: Date | null, fim: Date | null): string;
  // import-history.tsx
  export async function ImportHistory({ userId }: { userId: string }): Promise<JSX.Element | null>;
  // delete-import-button.tsx
  export function DeleteImportButton(props: { id: string; nomeArquivo: string; transacoes: number; periodo: string }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test** em `tests/domain/period.test.ts`:
  ```ts
  test("formats a period inside one month", () => {
    expect(formatPeriod(new Date("2026-09-03T10:00:00Z"), new Date("2026-09-20T08:00:00Z"))).toBe("03/09/2026 a 20/09/2026");
  });
  test("formats a single day", () => {
    expect(formatPeriod(new Date("2026-09-03T10:00:00Z"), new Date("2026-09-03T22:00:00Z"))).toBe("03/09/2026");
  });
  test("returns 'sem transações' when empty", () => {
    expect(formatPeriod(null, null)).toBe("sem transações");
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `npx vitest run tests/domain/period.test.ts`
  Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implement `formatPeriod`** com `toLocaleDateString("pt-BR", { timeZone: "UTC" })`.

- [ ] **Step 4: Run test to verify it passes**

  Run: `npx vitest run tests/domain/period.test.ts`
  Expected: 3 passed

- [ ] **Step 5: Implement a UI**

  - `ImportHistory`: chama `listImports(db, userId)`; lista vazia → `null`. Senão, `<section>` com `<h2>Importações anteriores</h2>` e um `Card` com uma linha por importação: nome do arquivo (truncado), data/hora (`toLocaleString("pt-BR")`, fuso local — `criado_em` é timestamp real), `"<N> transações"` e `formatPeriod(inicio, fim)`; à direita `DeleteImportButton`.
  - `DeleteImportButton`: `Button variant="ghost" size="sm"` com ícone `Trash2` (lucide) e texto "Excluir", `aria-label="Excluir importação <arquivo>"`. Abre `Dialog` com o texto exato da confirmação; botões "Cancelar" e "Excluir importação" (`variant="destructive"`). Ao confirmar: `useTransition` → `deleteImportAction(id)`; erro → `toast.error(error)`; sucesso → `toast.success("Importação excluída: <N> transações apagadas")` e fecha o diálogo. Botão de confirmar desabilitado enquanto `pending` e mostra "Excluindo...".
  - Para "<período>" na confirmação de importação sem transações, usar o mesmo `formatPeriod` ("0 transações de sem transações" é ruim): quando `transacoes === 0`, a confirmação vira `Excluir a importação '<arquivo>'? Ela não tem transações. Essa ação não pode ser desfeita.`
  - `page.tsx`: renderizar `<ImportHistory userId={userId} />` abaixo de `<ImportForm />`.

- [ ] **Step 6: Verify**

  Run: `npx tsc --noEmit && npm run lint && npm test`
  Expected: sem erros; todos os testes passam.

  Manual (`npm run dev`): importar `tests/fixtures/picpay-sample.csv` → item aparece no histórico com contagem e período; excluir → toast de sucesso, item some, dashboard/transações sem essas linhas; importar de novo → prévia mostra todas como novas; no celular (375px) a linha não estoura a largura e o diálogo cabe na tela.

### Task 4: Tabelas do cartão, faturas e parcelas

**Files:**
- Modify: `src/db/schema.ts`
- Create: migração gerada em `drizzle/0002_*.sql` + migração customizada `credit_rls`

**Interfaces:**
- Produces (Drizzle, `src/db/schema.ts`):
  ```ts
  creditCards     // credit_cards: id uuid pk, user_id uuid not null UNIQUE, nome text not null,
                  //   dia_fechamento int not null, dia_vencimento int not null
  invoices        // invoices: id, user_id, card_id → credit_cards (cascade), mes text not null ("AAAA-MM", mês do fechamento),
                  //   fechamento timestamp not null, vencimento timestamp not null, paga boolean default false,
                  //   paga_em timestamptz null; UNIQUE(card_id, mes)
  creditPurchases // credit_purchases: id, user_id, card_id → credit_cards (cascade), descricao text not null,
                  //   category_id → categories (set null), valor_total int not null, parcelas int not null,
                  //   data_compra timestamp not null, transaction_id → transactions (set null) UNIQUE null
  installments    // installments: id, user_id, purchase_id → credit_purchases (cascade), invoice_id → invoices (restrict),
                  //   numero int not null, valor int not null, paga boolean default false
  export type CreditCard, Invoice, CreditPurchase, Installment  // $inferSelect
  ```

- [ ] **Step 1:** Adicionar as tabelas acima em `schema.ts`, com `index().on(userId)` em `credit_purchases` e `installments`.
- [ ] **Step 2:** `npx drizzle-kit generate` → migração `0002_*.sql` com as 4 tabelas. Depois `npx drizzle-kit generate --custom --name=credit_rls` e colar `ENABLE ROW LEVEL SECURITY` das 4 tabelas (padrão de `drizzle/0001_enable_rls.sql`).
- [ ] **Step 3:** `npx drizzle-kit migrate` no banco de testes e no de dev. Expected: sem erro; `npx tsc --noEmit` limpo.

### Task 5: Regras puras de fatura e parcelas

**Files:**
- Create: `src/domain/invoice.ts`
- Test: `tests/domain/invoice.test.ts`

**Interfaces:**
- Consumes: `MonthKey` de `src/domain/month.ts`.
- Produces:
  ```ts
  export type CardDays = { diaFechamento: number; diaVencimento: number };
  /** Mês ("AAAA-MM") da fatura: dia ≤ fechamento → mesmo mês; senão mês seguinte. */
  export function invoiceMonthFor(dataCompra: Date, diaFechamento: number): MonthKey;
  /** Datas da fatura do mês; dias inexistentes viram o último dia do mês. */
  export function invoiceDates(mes: MonthKey, card: CardDays): { fechamento: Date; vencimento: Date };
  export function addMonths(mes: MonthKey, n: number): MonthKey;
  /** Divide em centavos; a sobra do arredondamento vai para a 1ª parcela. */
  export function splitInstallments(valorTotal: number, parcelas: number): number[];
  export type PlannedInstallment = { numero: number; mes: MonthKey; valor: number; paga: boolean };
  export function planInstallments(
    input: { dataCompra: Date; valorTotal: number; parcelas: number; jaPagas: number },
    card: CardDays,
  ): PlannedInstallment[];
  ```

- [ ] **Step 1: Write the failing tests** (`card = { diaFechamento: 10, diaVencimento: 17 }` salvo indicação):
  - `invoiceMonthFor`: 2026-03-10 → `"2026-03"`; 2026-03-11 → `"2026-04"`; 2026-12-15 → `"2027-01"`.
  - `invoiceDates("2026-03", card)` → fechamento 2026-03-10, vencimento 2026-03-17. Com `{ 25, 5 }`: fechamento 2026-03-25, vencimento 2026-04-05. Com `{ 31, 10 }` e `"2026-02"`: fechamento 2026-02-28.
  - `addMonths("2026-11", 3)` → `"2027-02"`.
  - `splitInstallments(10000, 3)` → `[3334, 3333, 3333]`; `splitInstallments(9000, 3)` → `[3000, 3000, 3000]`.
  - `planInstallments({ dataCompra: 2026-03-20, valorTotal: 10000, parcelas: 3, jaPagas: 1 }, card)` → meses `["2026-04", "2026-05", "2026-06"]`, `paga` `[true, false, false]`.
- [ ] **Step 2:** `npx vitest run tests/domain/invoice.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3:** Implementar em `src/domain/invoice.ts`, só com `Date.UTC` / `getUTC*`.
- [ ] **Step 4:** `npx vitest run tests/domain/invoice.test.ts` → todos passam.

### Task 6: Operações de crédito no banco

**Files:**
- Create: `src/db/credit.ts`
- Test: `tests/db/credit.test.ts`

**Interfaces:**
- Consumes: tabelas da Task 4; `planInstallments`, `invoiceDates`, `CardDays` da Task 5.
- Produces:
  ```ts
  export class CreditError extends Error {}   // mensagem exibível ao usuário
  export async function getCard(db: Db, userId: string): Promise<CreditCard | null>;
  export async function saveCard(db: Db, userId: string, input: { nome: string; diaFechamento: number; diaVencimento: number }): Promise<CreditCard>; // upsert por user_id
  export type PurchaseInput = { descricao: string; categoryId: string | null; dataCompra: Date; parcelas: number; jaPagas: number }
    & ({ valorTotal: number } | { valorParcela: number });
  export async function createPurchase(db: Db, userId: string, input: PurchaseInput): Promise<{ purchaseId: string }>;
  export async function convertTransaction(db: Db, userId: string, transactionId: string, input: { parcelas: number; jaPagas: number }): Promise<{ purchaseId: string }>;
  export async function undoConversion(db: Db, userId: string, transactionId: string): Promise<void>;
  export async function listInvoices(db: Db, userId: string): Promise<(Invoice & { total: number })[]>; // por mes asc
  export async function getInvoice(db: Db, userId: string, invoiceId: string): Promise<{ invoice: Invoice; itens: { descricao: string; numero: number; parcelas: number; valor: number }[] } | null>;
  export async function markInvoicePaid(db: Db, userId: string, invoiceId: string): Promise<boolean>; // fatura + parcelas
  /** Parcelas das faturas que fecham no mês, para o dashboard. */
  export async function getInstallmentsForMonth(db: Db, userId: string, mes: MonthKey): Promise<{ valor: number; categoryId: string | null }[]>;
  ```
  Regras:
  - Sem cartão → `CreditError("Configure o cartão antes")`.
  - `parcelas` entre 1 e 48, senão `CreditError("Número de parcelas inválido")`; `jaPagas` fora de `0..parcelas` → `CreditError("Parcelas pagas maior que o total")`.
  - `valorParcela` → total = parcela × parcelas.
  - Faturas criadas sob demanda (`onConflictDoNothing` em `(card_id, mes)`).
  - `convertTransaction`: transação do usuário e `tipo = GASTO` (`CreditError("Só gastos podem ir para o crédito")`), ainda não convertida (`CreditError("Transação já convertida")`); usa `descricao`, `categoryId`, `dataHora` e `-valor`; marca `convertida_credito = true`.
  - `undoConversion`: apaga a compra (parcelas em cascata) e volta `convertida_credito = false`.

- [ ] **Step 1: Write the failing tests** (esqueleto de `tests/db/seed-user.test.ts`; limpeza por `user_id` no `finally`, na ordem installments → credit_purchases → invoices → credit_cards → transactions):
  - `saveCard upserts a single card per user`
  - `createPurchase splits 100,00 in 3 across invoices` — parcelas `[3334, 3333, 3333]` em 3 faturas; `jaPagas: 1` → 1ª parcela paga.
  - `createPurchase with valorParcela multiplies` — 2500 × 4 → `valor_total` 10000.
  - `rejects jaPagas greater than parcelas` — lança `CreditError`, nenhuma linha criada.
  - `convertTransaction marks transaction and creates purchase`; segunda chamada → `"Transação já convertida"`; RECEITA → `CreditError`.
  - `undoConversion removes purchase and installments and clears flag`
  - `markInvoicePaid marks invoice and its installments`; fatura de outro usuário → `false`.
  - `getInstallmentsForMonth returns only that closing month`
- [ ] **Step 2:** `npx vitest run tests/db/credit.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3:** Implementar `src/db/credit.ts`.
- [ ] **Step 4:** `npx vitest run tests/db/credit.test.ts` → todos passam.

### Task 7: Exclusão de importação desfaz conversões

**Files:**
- Modify: `src/db/imports.ts`, `src/app/(app)/importar/actions.ts`
- Test: `tests/db/imports.test.ts`

**Interfaces:**
- Consumes: tabelas da Task 4; `CreditError` da Task 6.
- Produces: `deleteImport` lança `CreditError("Esta importação tem compras em faturas pagas. Desfaça a conversão delas antes de excluir.")` se alguma parcela de compra ligada a transação da importação estiver em fatura `paga`; senão apaga essas compras (parcelas em cascata) antes das transações, na mesma `db.transaction`. `deleteImportAction` devolve `e.message` como `error` para `CreditError`.

- [ ] **Step 1: Write the failing tests:** `deletes conversions of the import's transactions` (compra e parcelas somem); `blocks when an installment is in a paid invoice` (lança; transações e compra continuam).
- [ ] **Step 2:** `npx vitest run tests/db/imports.test.ts` → os 2 novos falham.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npx vitest run tests/db` → todos passam.

### Task 8: Tela Cartão e faturas

**Files:**
- Create: `src/app/(app)/cartao/page.tsx`, `src/app/(app)/cartao/actions.ts`, `src/app/(app)/cartao/card-form.tsx`, `src/app/(app)/cartao/[faturaId]/page.tsx`, `src/app/(app)/cartao/mark-paid-button.tsx`
- Modify: `src/components/app-nav.tsx` — item `{ href: "/cartao", label: "Cartão", short: "Cartão", icon: CreditCard }` entre Transações e Importar.

**Interfaces:**
- Consumes: `getCard`, `saveCard`, `listInvoices`, `getInvoice`, `markInvoicePaid` (Task 6); `isUuid` (Task 2).
- Produces: `saveCardAction(input: { nome: string; diaFechamento: number; diaVencimento: number }): Promise<{ error?: string }>` (nome não vazio, dias inteiros 1–31); `markInvoicePaidAction(invoiceId: string): Promise<{ error?: string }>`.

- [ ] **Step 1:** `/cartao` sem cartão → formulário (nome, dia de fechamento, dia de vencimento, botão "Salvar cartão"). Com cartão → dados editáveis + lista de faturas (mês por extenso, vencimento, total em `formatBRL`, status "Paga" / "Em aberto"), cada uma levando a `/cartao/<id>`, e botão "Nova compra". Sem faturas → "Nenhuma compra no crédito ainda."
- [ ] **Step 2:** `/cartao/[faturaId]`: id inválido ou de outro usuário → `notFound()`. Mostra fechamento, vencimento, total, itens (`<descrição> <n>/<parcelas>` e valor) e `Marcar como paga` (some quando paga; toast "Fatura marcada como paga").
- [ ] **Step 3:** `npx tsc --noEmit && npm run lint && npm test` → limpo. Verificar que a barra inferior com 5 itens cabe em 375px.

### Task 9: Nova compra no crédito e conversão de transação

**Files:**
- Create: `src/domain/purchase-input.ts`, `src/app/(app)/cartao/nova/page.tsx`, `src/app/(app)/cartao/purchase-form.tsx`, `src/app/(app)/transacoes/convert-dialog.tsx`
- Modify: `src/app/(app)/cartao/actions.ts`, `src/app/(app)/transacoes/actions.ts`, `src/app/(app)/transacoes/transaction-row.tsx`, `src/app/(app)/transacoes/page.tsx` (passar `convertidaCredito` e se há cartão)
- Test: `tests/domain/purchase-input.test.ts`

**Interfaces:**
- Consumes: `createPurchase`, `convertTransaction`, `undoConversion`, `CreditError`, `PurchaseInput` (Task 6).
- Produces:
  ```ts
  // src/domain/purchase-input.ts
  export function parsePurchaseForm(f: { descricao: string; categoryId: string; valor: string; modo: "total" | "parcela"; parcelas: string; jaPagas: string; data: string }): { input: PurchaseInput } | { error: string };
  // actions
  createPurchaseAction(f): Promise<{ error?: string }>;
  convertTransactionAction(id: string, input: { parcelas: number; jaPagas: number }): Promise<{ error?: string }>;
  undoConversionAction(id: string): Promise<{ error?: string }>;
  ```
  `valor` aceita "1.234,56" ou "1234,56", sem "R$".

- [ ] **Step 1: Write the failing tests** para `parsePurchaseForm`: "1.234,56" modo total → `valorTotal: 123456`; modo parcela "25,00" × "4" → `valorParcela: 2500`, `parcelas: 4`; descrição vazia → `{ error: "Informe a descrição" }`; valor "abc" → `{ error: "Valor inválido" }`; data vazia → `{ error: "Informe a data da compra" }`.
- [ ] **Step 2:** `npx vitest run tests/domain/purchase-input.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `parsePurchaseForm` e as actions (sucesso → `revalidatePath("/", "layout")`; `CreditError` → `{ error: e.message }`; ids validados com `isUuid`).
- [ ] **Step 4:** UI. `/cartao/nova`: descrição, categoria, valor com alternância "Valor total" / "Valor da parcela", nº de parcelas, data e `Quantas parcelas já foram pagas?` (padrão 0). Em Transações, cada GASTO não convertido ganha "Passar para o crédito" (só se houver cartão), que abre `convert-dialog` com nº de parcelas e `Quantas parcelas já foram pagas?`; convertidas mostram selo "Crédito" e ação "Desfazer conversão".
- [ ] **Step 5:** `npx vitest run tests/domain/purchase-input.test.ts && npx tsc --noEmit && npm run lint` → limpo.

### Task 10: Dashboard conta as parcelas

**Files:**
- Modify: `src/app/(app)/page.tsx`, `src/db/queries.ts` (`getAvailableMonths`)
- Test: `tests/domain/summary.test.ts`

**Interfaces:**
- Consumes: `getInstallmentsForMonth` (Task 6); `summarizeByCategory` (sem mudar a assinatura).

- [ ] **Step 1: Write the test** `counts installments mapped as GASTO and skips the converted transaction`: transação `{ valor: -9000, tipo: "GASTO", convertidaCredito: true, categoryId: "c1" }` + parcela mapeada `{ valor: -3000, tipo: "GASTO", convertidaCredito: false, categoryId: "c1" }` → total de `c1` = `3000`. Ele já passa com o código atual; serve para travar o contrato do mapeamento.
- [ ] **Step 2:** Em `page.tsx`, buscar `getInstallmentsForMonth(db, userId, month)` junto com as transações e passar `[...txs, ...parcelas.map((p) => ({ valor: -p.valor, tipo: "GASTO" as const, convertidaCredito: false, categoryId: p.categoryId }))]` para `summarizeByCategory`. Em `getAvailableMonths`, unir os `invoices.mes` do usuário (meses só com parcelas aparecem no seletor), mais recente primeiro.
- [ ] **Step 3:** `npm test && npx tsc --noEmit && npm run lint && npm run build` → tudo limpo.
- [ ] **Step 4 (manual, para o usuário):** configurar cartão (fecha 10, vence 17); converter um gasto de R$ 300,00 do dia 20 em 3x → os gastos daquele mês caem R$ 300,00 e os 3 meses seguintes mostram R$ 100,00 na categoria; faturas listadas; marcar uma como paga; tentar excluir a importação daquela transação → mensagem de bloqueio.
