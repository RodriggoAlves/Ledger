# Fase 3 — Importação da fatura PicPay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Nenhum step faz commit: o usuário testa e commita.

**Goal:** Importar a fatura PDF do PicPay (compras, parcelas, estornos, pagamento), projetar faturas futuras, reconhecer a mesma compra entre meses e remover "Passar para o crédito" e a compra manual.

**Architecture:** Extração de texto do PDF isolada em `src/lib/pdf-text.ts` (única peça que conhece o PDF). Todo o resto é puro e testável sem banco: parser do texto → linhas resolvidas (ano, tipo, chave) → plano de importação, que compara com o estado atual do cartão. `src/db/invoice-import.ts` só carrega o estado e aplica o plano numa transação. Server actions autenticam, validam e chamam essas funções, no padrão de `src/app/(app)/importar/actions.ts`.

**Tech Stack:** Next.js 15 (App Router, server actions), Drizzle ORM + drizzle-kit + postgres-js, Supabase (RLS), Vitest, `unpdf` (nova dependência), lucide-react, sonner.

**Spec:** `docs/superpowers/specs/fase-3/2026-11-01-fase-3-fatura-picpay-design.md` (seções referidas como §N).

## Global Constraints

- **Não fazer commits.** Ao fim de cada task, deixar as mudanças no working tree e reportar o que mudou e como testar.
- **Não rodar `next dev`/`next build`** enquanto o servidor de desenvolvimento do usuário estiver rodando (eles compartilham `.next`). Verificação de tipos: `npx tsc --noEmit`.
- Valores em centavos (inteiro). Datas em "horário de parede" UTC (`Date.UTC`, `getUTC*`, `timeZone: "UTC"` ao exibir), como em `src/domain/month.ts`.
- Toda consulta filtra por `user_id`; toda tabela nova recebe `ENABLE ROW LEVEL SECURITY` na migração (padrão de `drizzle/0003_credit_rls.sql`). Operações em mais de uma tabela rodam em `db.transaction`.
- Sem IA nem serviço externo: leitura por extração de texto + regex.
- PDFs reais nunca são commitados: `*.pdf` no `.gitignore`. Fixture de teste sem nome e endereço.
- Textos exatos da spec:
  - `Arquivo não parece ser uma fatura do PicPay`
  - `Remova a senha do PDF antes de importar`
  - `Arquivo muito grande (máx. 5 MB)`
  - `A fatura não foi lida corretamente (diferença de R$ X)` (X via `formatBRL` sem o prefixo duplicado: `diferença de ${formatBRL(diff)}`)
  - `A fatura de <mês> já foi importada` (`<mês>` = `formatMonth(mes)`)
  - `Exclua primeiro a fatura de <mês mais novo>`
  - Prévia: `<DESCRIÇÃO> <k>/<n> era esperada e não veio`
  - Etiqueta de transação: `Débito` · status de fatura: `Paga`, `Fechada`, `Projetada`
- `mes` da fatura = mês do **fechamento** (`AAAA-MM`). Fatura 09/2026 → `2026-09`.

## Review Focus

- Layout em duas colunas e lista que continua na página seguinte → linhas na ordem certa e soma = 6.405,25. Teste na Task 2 (fixture real).
- Parcela antiga cuja data cai em outro ano (`21/02 PARC08/10` com fechamento 29/09/2026; `15/12` com fechamento 29/01/2027) → ano correto. Teste na Task 3.
- Duas linhas idênticas na mesma fatura (`CARNE DE SOL 1008` tem valores diferentes; criar caso sintético com valor igual) → duas compras, chaves com ocorrência 0 e 1. Teste na Task 3.
- Importar outubro depois de setembro → `PARC09/10` confirma a parcela projetada, não cria compra nova; setembro vira Paga pela linha de pagamento. Teste na Task 6.
- Excluir a importação mais recente → estado volta exatamente ao anterior (confirmações, cancelamentos, pagamento). Teste na Task 6.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/pdf-text.ts` | PDF (bytes) → texto em linhas, ordem página/coluna/linha |
| `src/domain/picpay-invoice-parser.ts` | texto → cabeçalho, linhas brutas, total; conferência |
| `src/domain/invoice-lines.ts` | ano da data, tipo da linha, chave da compra, pares de estorno |
| `src/domain/invoice-import-plan.ts` | linhas + estado atual → plano (criar, confirmar, reprojetar, cancelar, pagar) |
| `src/db/invoice-import.ts` | carregar estado, aplicar plano, excluir importação |
| `src/db/credit.ts` | consultas de faturas/parcelas (enxugado) |
| `src/app/(app)/cartao/*` | upload, prévia, lista, histórico, detalhe |

---

### Task 1: Extração de texto do PDF e fixture

**Files:**
- Modify: `package.json` (`npm install unpdf`), `.gitignore` (adicionar `*.pdf`)
- Create: `src/lib/pdf-text.ts`
- Create: `scripts/extract-invoice-text.ts` (utilitário local, gera a fixture)
- Create: `tests/fixtures/picpay-fatura-092026.txt`
- Test: `tests/lib/pdf-text.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class PdfPasswordError extends Error {}
  export class PdfReadError extends Error {}
  /** Uma linha por linha visual; ordem: página → coluna esquerda → direita → de cima para baixo. */
  export async function extractPdfLines(data: Uint8Array): Promise<string[]>;
  ```

- [ ] **Step 1: Instalar** `npm install unpdf` e adicionar `*.pdf` ao `.gitignore`.

- [ ] **Step 2: Write the failing test** em `tests/lib/pdf-text.test.ts`, pulado se o PDF real não existir (`describe.skipIf(!existsSync("PicPay_Fatura_092026.pdf"))`):
  ```ts
  test("extracts left column before right column, in reading order", async () => {
    const lines = await extractPdfLines(new Uint8Array(readFileSync("PicPay_Fatura_092026.pdf")));
    const i = (s: string) => lines.findIndex((l) => l.includes(s));
    expect(i("Vencimento: 05/10/2026 | Fechamento: 29/09/2026")).toBeGreaterThanOrEqual(0);
    expect(i("13/09 GOOGLE 23,99")).toBeLessThan(i("21/02 AMAZON BR PARC08/10 230,88"));
    expect(i("21/02 AMAZON BR PARC08/10 230,88")).toBeLessThan(i("20/06 MERCADOLIVRE*MPARC04/10 127,79"));
    expect(i("02/09 MP *MILAGRESDOPOR 126,50")).toBeLessThan(i("02/09 PADOCA VENCHY 22,89"));
    expect(lines).toContain("Total geral dos lançamentos 6.405,25");
  });
  test("rejects bytes that are not a PDF", async () => {
    await expect(extractPdfLines(new TextEncoder().encode("abc"))).rejects.toBeInstanceOf(PdfReadError);
  });
  ```

- [ ] **Step 3: Run** `npx vitest run tests/lib/pdf-text.test.ts` → FAIL (módulo não existe).

- [ ] **Step 4: Implement `extractPdfLines`.** `getDocumentProxy` do `unpdf`; erro de senha (`PasswordException` / `name === "PasswordException"`) → `PdfPasswordError`; qualquer outro erro de abertura → `PdfReadError`. Por página: `page.getViewport({ scale: 1 }).width / 2` separa colunas pelo `transform[4]` (x) de cada item; dentro da coluna, agrupar itens cujo `transform[5]` (y) difere ≤ 2, ordenar grupos por y decrescente e itens por x crescente, juntar com espaço e colapsar espaços. Descartar linhas vazias. Se o resultado de uma página ficar com a ordem errada para o cabeçalho (que ocupa a largura toda), aceitar: o parser só usa o cabeçalho por regex.

- [ ] **Step 5: Run** → PASS (2 testes; ajustar a tolerância de y se a ordem falhar).

- [ ] **Step 6: Gerar a fixture.** `scripts/extract-invoice-text.ts` lê o PDF passado por argumento e imprime `extractPdfLines(...).join("\n")`. Rodar `npx tsx scripts/extract-invoice-text.ts PicPay_Fatura_092026.pdf > tests/fixtures/picpay-fatura-092026.txt` e **substituir à mão** nome e endereço por `TITULAR TESTE` / `ENDERECO TESTE`. Conferir que nenhuma linha contém `RODRIGGO`, `Geraldo` ou o CEP.

---

### Task 2: Parser do texto da fatura

**Files:**
- Create: `src/domain/picpay-invoice-parser.ts`
- Test: `tests/domain/picpay-invoice-parser.test.ts`

**Interfaces:**
- Consumes: `parseBRL` de `src/domain/money.ts` (se não aceitar `1.661,55` sem `R$`, adicionar suporte lá com teste).
- Produces:
  ```ts
  export type RawInvoiceLine = {
    dia: number; mes: number;            // da coluna Data (DD/MM)
    descricao: string;                   // sem o sufixo PARC
    valor: number;                       // centavos, com sinal
    parcela: { numero: number; total: number } | null;
    cartaoFinal: string | null;          // "9109"; null = "Picpay Card" do titular
  };
  export type ParsedInvoice = { fechamento: Date; vencimento: Date; totalGeral: number; linhas: RawInvoiceLine[] };
  export class InvalidInvoiceFileError extends Error {}   // "Arquivo não parece ser uma fatura do PicPay"
  export class InvoiceTotalMismatchError extends Error { constructor(public diferenca: number) }
  export function parsePicPayInvoice(lines: string[]): ParsedInvoice;
  ```

- [ ] **Step 1: Write the failing tests** (fixture lida com `readFileSync(...).split("\n")`):
  - `reads header dates` → `fechamento` = `Date.UTC(2026, 8, 29)`, `vencimento` = `Date.UTC(2026, 9, 5)`.
  - `reads all lines and checks the total` → `totalGeral === 640525`; soma dos valores positivos `=== 640525`; `linhas.length === 89` (contar na fixture e ajustar este número uma vez, se a contagem manual divergir).
  - `parses installments and card finals` → linha `AMAZON BR` com `{ dia: 21, mes: 2, valor: 23088, parcela: { numero: 8, total: 10 }, cartaoFinal: "9083" }`; `MERCADOLIVRE*M` com parcela `4/10` no final `9091`; `GOOGLE 2399` com `cartaoFinal: null`.
  - `keeps negative lines` → `PAGAMENTO DE FATURA` com `valor: -166155`; dois `-319900`.
  - `rejects text without header` → `parsePicPayInvoice(["qualquer coisa"])` lança `InvalidInvoiceFileError`.
  - `rejects when sum differs from total` → fixture com a linha `13/09 GOOGLE 23,99` removida lança `InvoiceTotalMismatchError` com `diferenca === 2399`.

- [ ] **Step 2: Run** `npx vitest run tests/domain/picpay-invoice-parser.test.ts` → FAIL.

- [ ] **Step 3: Implement `parsePicPayInvoice`.** Regex:
  - cabeçalho: `/Vencimento:\s*(\d{2})\/(\d{2})\/(\d{4})\s*\|\s*Fechamento:\s*(\d{2})\/(\d{2})\/(\d{4})/` (primeira ocorrência);
  - início/fim do trecho: primeira linha `Transações Nacionais` até `/^Total geral dos lançamentos\s+([\d.]+,\d{2})$/`;
  - cartão: `/^Picpay Card(?: final (\d{4}))?$/` (pode vir após o nome do titular na linha anterior; só o padrão importa);
  - lançamento: `/^(\d{2})\/(\d{2})\s+(.+?)\s+(-?[\d.]+,\d{2})$/`;
  - parcela: `/PARC(\d{2})\/(\d{2})$/` no fim da descrição, removido com `trim()`.
  Sem cabeçalho ou sem total → `InvalidInvoiceFileError`. Soma dos positivos ≠ total → `InvoiceTotalMismatchError(total − soma)`.

- [ ] **Step 4: Run** → PASS.

---

### Task 3: Linhas resolvidas (ano, tipo, chave, pares)

**Files:**
- Create: `src/domain/invoice-lines.ts`
- Test: `tests/domain/invoice-lines.test.ts`

**Interfaces:**
- Consumes: `RawInvoiceLine`, `ParsedInvoice` (Task 2); `normalize` de `src/domain/categorization.ts`.
- Produces:
  ```ts
  export type LineKind = "PAGAMENTO" | "ESTORNO" | "COMPRA";
  export type InvoiceLine = RawInvoiceLine & {
    kind: LineKind;
    dataCompra: Date;
    chave: string;        // vazio para PAGAMENTO
    pareada: boolean;     // compra/estorno do mesmo valor na mesma fatura
  };
  export function purchaseDate(dia: number, mes: number, fechamento: Date, parcelaNumero: number): Date;
  export function resolveLines(parsed: ParsedInvoice): InvoiceLine[];
  ```

- [ ] **Step 1: Write the failing tests:**
  - `purchaseDate` (fechamento `2026-09-29`): `(21, 2, f, 8)` → `2026-02-21`; `(29, 9, f, 1)` → `2026-09-29`; `(30, 9, f, 1)` → `2025-09-30`.
  - `purchaseDate` (fechamento `2027-01-29`): `(15, 12, f, 1)` → `2026-12-15`.
  - `purchaseDate` (fechamento `2026-09-29`, parcela 12): `(20, 9, f, 12)` → `2025-09-20` (precisa de ≥ 11 meses antes do fechamento).
  - `resolveLines` na fixture: `PAGAMENTO DE FATURA` → `kind: "PAGAMENTO"`, `chave: ""`; `CREDITO PULA COMPRA` → `ESTORNO`; `GOOGLE 2399` → `COMPRA`.
  - chave: `AMAZON BR` → `"AMAZON BR|2026-02-21|10|23088|0"`.
  - ocorrência: duas linhas sintéticas `05/09 PADARIA 10,00` → chaves terminando em `|0` e `|1`.
  - pares: as duas `AMAZONMKTPLC*SAMSUNGEL` (3199,00 e −3199,00) → `pareada: true`; `CREDITO PULA COMPRA` → `false`.

- [ ] **Step 2: Run** `npx vitest run tests/domain/invoice-lines.test.ts` → FAIL.

- [ ] **Step 3: Implement.** `purchaseDate`: começar no ano do fechamento e descer um ano enquanto a data for > fechamento **ou** a diferença em meses (fechamento − compra) for < `parcelaNumero − 1`. Chave: `[normalize(descricao), AAAA-MM-DD, parcela?.total ?? 1, Math.abs(valor), ocorrência].join("|")`, com a ocorrência contada por chave-sem-ocorrência na ordem das linhas. Par: para cada negativa não pagamento, casar com uma positiva ainda não pareada de mesma descrição normalizada e mesmo valor absoluto.

- [ ] **Step 4: Run** → PASS.

---

### Task 4: Plano de importação (puro)

**Files:**
- Create: `src/domain/invoice-import-plan.ts`
- Test: `tests/domain/invoice-import-plan.test.ts`

**Interfaces:**
- Consumes: `InvoiceLine` (Task 3); `matchCategory`, `Rule` de `categorization.ts`; `addMonths`, `invoiceMonthFor` de `src/domain/invoice.ts`; `MonthKey`.
- Produces:
  ```ts
  /** Estado atual do cartão, carregado pela Task 6. */
  export type CardState = {
    importedMonths: MonthKey[];
    purchases: { id: string; chave: string; parcelas: number;
      installments: { id: string; numero: number; mes: MonthKey; confirmada: boolean; cancelada: boolean }[] }[];
  };
  export type NewPurchase = {
    chave: string; tipo: "COMPRA" | "ESTORNO"; descricao: string; categoryId: string | null;
    dataCompra: Date; parcelas: number; parcelaInicial: number; valorParcela: number; cartaoFinal: string | null;
    installments: { numero: number; mes: MonthKey; confirmada: boolean }[];
  };
  export type InvoiceImportPlan = {
    mes: MonthKey; fechamento: Date; vencimento: Date; totalGeral: number;
    novas: NewPurchase[];
    confirmar: { installmentId: string }[];
    mover: { installmentId: string; mes: MonthKey }[];               // reprojeções
    cancelar: { installmentId: string; descricao: string; numero: number; parcelas: number }[];
    pagarMes: MonthKey | null; pagaEm: Date | null;
    ignoradas: number; semCategoria: number;
  };
  export class InvoiceAlreadyImportedError extends Error {}         // "A fatura de <mês> já foi importada"
  export function buildInvoiceImportPlan(
    parsed: ParsedInvoice, lines: InvoiceLine[], state: CardState, rules: Rule[],
  ): InvoiceImportPlan;
  ```

- [ ] **Step 1: Write the failing tests** (estado vazio = `{ importedMonths: [], purchases: [] }`, fixture via Tasks 2–3):
  - `first import creates purchases with projections`: `mes === "2026-09"`; `AMAZON BR` nova com `parcelaInicial: 8`, installments `[{8,"2026-09",true},{9,"2026-10",false},{10,"2026-11",false}]`; `GOOGLE 2399` com 1 installment confirmado em `2026-09`; nenhuma nova com `PAGAMENTO`; `pagarMes === "2026-08"`, `pagaEm` = `2026-09-05`.
  - `estorno is a negative purchase`: `CREDITO PULA COMPRA` → `tipo: "ESTORNO"`, `valorParcela: -319900`.
  - `next month confirms instead of creating`: estado com a compra `AMAZON BR` (installment 9 em `2026-10` não confirmado, id `"i9"`); linhas sintéticas de fatura `2026-10` com `21/02 AMAZON BR PARC09/10 230,88` → `confirmar` contém `{ installmentId: "i9" }`, `novas` não contém AMAZON.
  - `moves a projection to the month it actually came`: installment 9 projetado em `2026-11`, linha chega em `2026-10` → `mover` contém `{ i9 → "2026-10" }` e o 10 vai para `2026-11`.
  - `cancels projections that did not come`: estado com installment 9 em `2026-10`, fatura `2026-10` sem a linha → `cancelar` contém i9 e i10, com `descricao`, `numero: 9`, `parcelas: 10`.
  - `ignores a 1x line already imported`: estado com a chave de `GOOGLE` → não está em `novas`, `ignoradas === 1`.
  - `refuses an already imported month`: `importedMonths: ["2026-09"]` → lança `InvoiceAlreadyImportedError` com mensagem `A fatura de setembro de 2026 já foi importada` (usar `formatMonth`; ajustar o texto esperado ao formato que ela devolve).
  - `applies category rules on description without PARC`: regra `{ padrao: "AMAZON", categoryId: "c1" }` → AMAZON com `categoryId: "c1"`; `semCategoria` conta as demais.

- [ ] **Step 2: Run** `npx vitest run tests/domain/invoice-import-plan.test.ts` → FAIL.

- [ ] **Step 3: Implement `buildInvoiceImportPlan`.** `mes` = `AAAA-MM` do fechamento. Parcela `j` de uma compra vista primeiro como `k` em `M` vai para `addMonths(M, j − k)`. Projeções canceladas: installments não confirmados, não cancelados, com `mes === M`, cuja compra não teve linha nesta fatura (mais as seguintes da mesma compra). `pagarMes = addMonths(M, -1)` quando há linha `PAGAMENTO`.

- [ ] **Step 4: Run** → PASS.

---

### Task 5: Remover conversão e compra manual; migração do banco

**Files:**
- Delete: `src/app/(app)/transacoes/convert-dialog.tsx`, `src/app/(app)/cartao/nova/`, `src/app/(app)/cartao/purchase-form.tsx`, `src/app/(app)/cartao/card-form.tsx`, `src/domain/purchase-input.ts`, `tests/domain/purchase-input.test.ts`
- Modify: `src/app/(app)/transacoes/actions.ts` (remover `convertTransactionAction`, `undoConversionAction`), `transaction-row.tsx` e `transacoes/page.tsx` (remover `CreditCell`/`convertidaCredito`), `src/app/(app)/cartao/actions.ts` (remover `saveCardAction`, `createPurchaseAction`), `src/db/credit.ts` (remover `createPurchase`, `convertTransaction`, `undoConversion`, `deletePurchasesOf`, `saveCard`, `validateCounts`, `insertPurchase`), `src/db/imports.ts` (remover o bloco de compras convertidas), `src/domain/summary.ts` (remover `convertidaCredito` de `SummaryTx`), `tests/domain/summary.test.ts`, `tests/db/imports.test.ts`, `tests/db/credit.test.ts` (remover casos de conversão/compra manual)
- Modify: `src/db/schema.ts`
- Create: `drizzle/0004_*.sql` (gerada) e `drizzle/0005_invoice_import_rls.sql`

**Interfaces:**
- Produces (schema, §7 da spec):
  ```ts
  creditCards: + banco: text("banco").notNull().default("PICPAY"); unique(userId, banco) no lugar de userId.unique()
  invoiceImports: id, userId, cardId → creditCards (cascade), invoiceId → invoices (cascade), nomeArquivo, criadoEm,
                  totalLancamentos integer, linhas integer
  invoices: + importId uuid null, + pagaPorImportId uuid null   (sem FK, evita ciclo com invoice_imports)
  creditPurchases: − transactionId; + tipo pgEnum("purchase_type", ["COMPRA","ESTORNO"]), chave text, parcelaInicial integer,
                   cartaoFinal text null, importId uuid → invoiceImports (cascade); unique(cardId, chave)
  installments: − paga; + confirmadaPorImportId uuid null, + canceladaPorImportId uuid null
  transactions: − convertidaCredito
  export type InvoiceImport = typeof invoiceImports.$inferSelect;
  ```

- [ ] **Step 1: Remover o código listado.** `getCard(db, userId)` passa a filtrar também `banco = "PICPAY"`. A página `/cartao` deixa de importar `CardForm` e o link "Nova compra" (a UI nova vem na Task 7; por ora a página só lista faturas).

- [ ] **Step 2: Alterar `schema.ts`** conforme Interfaces e rodar `npx drizzle-kit generate`. **Editar o SQL gerado** para começar com:
  ```sql
  DELETE FROM "installments"; DELETE FROM "credit_purchases"; DELETE FROM "invoices"; DELETE FROM "credit_cards";
  ```
  (colunas `NOT NULL` novas sem default só funcionam com as tabelas vazias). Criar `drizzle/0005_invoice_import_rls.sql` com `ALTER TABLE "invoice_imports" ENABLE ROW LEVEL SECURITY;` e registrá-la em `drizzle/meta/_journal.json` do mesmo jeito que a `0003_credit_rls`.

- [ ] **Step 3: Aplicar no banco de teste** (`npx drizzle-kit migrate` com `DATABASE_URL` apontando para o banco de teste, como nas fases anteriores) e rodar `npx tsc --noEmit` e `npx vitest run` → tudo verde (os testes removidos não existem mais; os restantes passam).

- [ ] **Step 4: Reportar ao usuário** que a migração apaga os dados de cartão existentes e precisa ser aplicada no banco de produção por ele.

---

### Task 6: Aplicar e excluir importação no banco

**Files:**
- Create: `src/db/invoice-import.ts`
- Modify: `src/db/credit.ts` (`listInvoices`, `getInvoice`, `getInstallmentsForMonth`, `markInvoicePaid`)
- Test: `tests/db/invoice-import.test.ts`

**Interfaces:**
- Consumes: `CardState`, `InvoiceImportPlan`, `buildInvoiceImportPlan` (Task 4); schema (Task 5); `invoiceDates` de `src/domain/invoice.ts`.
- Produces:
  ```ts
  export async function loadCardState(db: Db, userId: string): Promise<CardState>;
  /** Cria/atualiza o cartão PICPAY com os dias do PDF e grava o plano. Devolve o id da importação. */
  export async function applyInvoiceImport(db: Db, userId: string, fileName: string, plan: InvoiceImportPlan): Promise<string>;
  export type InvoiceImportSummary = { id: string; nomeArquivo: string; criadoEm: Date; mes: MonthKey };
  export async function listInvoiceImports(db: Db, userId: string): Promise<InvoiceImportSummary[]>; // mais recente (mes) primeiro
  /** null = não encontrada; lança CreditError("Exclua primeiro a fatura de <mês>") se não for a mais recente. */
  export async function deleteInvoiceImport(db: Db, userId: string, importId: string): Promise<{ ok: true } | null>;
  // credit.ts
  export type InvoiceStatus = "PAGA" | "FECHADA" | "PROJETADA";
  export async function listInvoices(db: Db, userId: string): Promise<(Invoice & { total: number; status: InvoiceStatus })[]>;
  export async function getInvoice(db: Db, userId: string, invoiceId: string): Promise<{ invoice: Invoice; status: InvoiceStatus;
    itens: { purchaseId: string; descricao: string; dataCompra: Date; numero: number; parcelas: number; valor: number;
             categoryId: string | null; cartaoFinal: string | null; pareada: boolean }[] } | null>;
  ```
  `getInvoice` calcula `pareada` com a mesma regra da Task 3 sobre os itens da fatura (reutilizar uma função exportada de `invoice-lines.ts`: `export function pairedIndexes(items: { descricao: string; valor: number }[]): Set<number>`, que `resolveLines` também usa).

- [ ] **Step 1: Write the failing tests** no formato de `tests/db/credit.test.ts` (`describe.skipIf(!url)`, usuários `randomUUID()`, limpeza no `finally`). Planos montados com `buildInvoiceImportPlan` a partir da fixture e de uma fatura sintética de outubro (`Vencimento: 05/11/2026 | Fechamento: 29/10/2026`, linhas `05/10 PAGAMENTO DE FATURA -7,25`, `21/02 AMAZON BR PARC09/10 230,88`, `16/09 MERCADOLIVRE*MPARC02/10 146,47`, total `377,35`):
  - `imports september` → cartão PICPAY com `diaFechamento 29`, `diaVencimento 5`; `listInvoices`: `2026-09` com `status FECHADA` e `total` = soma das linhas sem o pagamento = `640525 - 319900 - 319900 = 725` (bate com "Total da fatura R$ 7,25" do PDF); `2026-10` `PROJETADA`.
  - `importing october confirms and pays september` → nenhuma compra AMAZON nova (contagem de `credit_purchases` com chave AMAZON = 1); installment 9 confirmado; `2026-09` `PAGA`; a parcela 4/04 de `GOL LINHAS A*H` (projetada para outubro e ausente da fatura sintética) tem `canceladaPorImportId` preenchido.
  - `dashboard ignores cancelled installments` → `getInstallmentsForMonth(db, user, "2026-10")` não inclui as canceladas.
  - `refuses deleting an older import` → `deleteInvoiceImport(setembro)` lança `CreditError` com `Exclua primeiro a fatura de outubro de 2026` (formato de `formatMonth`).
  - `deleting the latest import restores previous state` → após excluir outubro: `2026-09` volta a `FECHADA`; installment 9 não confirmado; canceladas restauradas; `2026-10` `PROJETADA`.
  - `another user's import` → `deleteInvoiceImport(db, outroUser, id)` → `null`, nada muda.

- [ ] **Step 2: Run** `npx vitest run tests/db/invoice-import.test.ts` → FAIL.

- [ ] **Step 3: Implement.** `applyInvoiceImport` em `db.transaction`: upsert do cartão (`banco: "PICPAY"`, `nome: "PicPay"`, dias do `fechamento`/`vencimento`); fatura do `mes` com as datas do PDF e `importId`; registro em `invoice_imports`; faturas projetadas sob demanda com `invoiceDates` (padrão do antigo `invoiceId()` de `credit.ts`); `novas` → `credit_purchases` (`importId`, `valorTotal = valorParcela × parcelas`) + installments (confirmados recebem `confirmadaPorImportId`); `confirmar`/`mover`/`cancelar` atualizam installments com o id da importação; `pagarMes` → `paga = true`, `pagaEm`, `pagaPorImportId` (se a fatura existir e não estiver paga). `deleteInvoiceImport` desfaz na ordem inversa, usando as colunas `*PorImportId`, e apaga faturas projetadas sem parcelas. Status: `paga` → PAGA; `importId` → FECHADA; senão PROJETADA. Totais e `getInstallmentsForMonth` filtram `canceladaPorImportId IS NULL`. `markInvoicePaid` deixa de mexer em `installments`.

- [ ] **Step 4: Run** → PASS; `npx vitest run` inteiro → verde.

---

### Task 7: Tela Cartão: importar, prévia, lista e histórico

**Files:**
- Modify: `next.config.ts` (`experimental: { serverActions: { bodySizeLimit: "6mb" } }`)
- Modify: `src/app/(app)/cartao/actions.ts`, `src/app/(app)/cartao/page.tsx`
- Create: `src/app/(app)/cartao/invoice-import-form.tsx`, `src/app/(app)/cartao/invoice-import-history.tsx`
- Test: `tests/domain/guards.test.ts` (se criar helper novo em `guards.ts`)

**Interfaces:**
- Consumes: Tasks 1, 2, 3, 4, 6; `getRules` de `src/db/queries.ts`; `formatBRL`, `formatMonth`.
- Produces:
  ```ts
  export type InvoicePreview = {
    mes: MonthKey; vencimento: string; totalGeral: number;
    novas: number; confirmadas: number; naoVieram: string[];      // textos "<DESC> k/n era esperada e não veio"
    pagaMes: MonthKey | null; semCategoria: number; ignoradas: number;
  };
  export async function previewInvoiceAction(form: FormData): Promise<{ preview?: InvoicePreview; error?: string }>;
  export async function confirmInvoiceAction(form: FormData): Promise<{ error?: string }>;
  export async function deleteInvoiceImportAction(importId: string): Promise<{ error?: string }>;
  ```

- [ ] **Step 1: Implementar as actions.** `form.get("file")` deve ser `File` com `size ≤ 5 * 1024 * 1024` (senão `Arquivo muito grande (máx. 5 MB)`). Pipeline comum `planFromFile(userId, file)`: `extractPdfLines` → `parsePicPayInvoice` → `resolveLines` → `loadCardState` + `getRules` → `buildInvoiceImportPlan`. Mapear erros: `PdfPasswordError` → `Remova a senha do PDF antes de importar`; `PdfReadError`/`InvalidInvoiceFileError` → `Arquivo não parece ser uma fatura do PicPay`; `InvoiceTotalMismatchError` → `A fatura não foi lida corretamente (diferença de ${formatBRL(e.diferenca)})`; `InvoiceAlreadyImportedError`/`CreditError` → própria mensagem; outros → `console.error` + `Não foi possível processar a fatura`. `confirmInvoiceAction` refaz o pipeline com o mesmo arquivo (não confia na prévia) e chama `applyInvoiceImport`; `revalidatePath("/", "layout")`. `deleteInvoiceImportAction` valida `isUuid` (`Importação não encontrada`).

- [ ] **Step 2: UI.** `invoice-import-form.tsx` no padrão de `src/app/(app)/importar/import-form.tsx`: input `accept="application/pdf"`, ao escolher chama a prévia, mostra os números do `InvoicePreview` e a lista `naoVieram`, botão "Importar fatura" chama a confirmação (mesmo `File` guardado em estado) e dá `toast.success`. Página: título, `InvoiceImportForm`, lista de faturas com badge por status (`Paga` verde como hoje, `Fechada` neutro, `Projetada` tracejado/`text-muted-foreground`), "Vence em …" e total; `InvoiceImportHistory` no padrão de `import-history.tsx` + `delete-import-button.tsx` (confirmação `Excluir a importação da fatura de <mês>? Essa ação não pode ser desfeita.`). Estado vazio: `Nenhuma fatura importada ainda. Importe o PDF da fatura do PicPay.`

- [ ] **Step 3: Verify.** `npx tsc --noEmit` e `npx vitest run` → verdes. Pedir ao usuário para testar no servidor dele: importar `PicPay_Fatura_092026.pdf`, conferir a prévia (total R$ 6.405,25, pagamento de ago/2026), confirmar, ver set/2026 Fechada e meses seguintes Projetada; importar de novo → `A fatura de … já foi importada`; enviar o CSV no lugar do PDF → `Arquivo não parece ser uma fatura do PicPay`.

---

### Task 8: Detalhe da fatura

**Files:**
- Modify: `src/app/(app)/cartao/[faturaId]/page.tsx`
- Create: `src/app/(app)/cartao/[faturaId]/purchase-category.tsx`
- Modify: `src/app/(app)/cartao/actions.ts`, `src/db/credit.ts`
- Test: `tests/db/invoice-import.test.ts` (caso novo)

**Interfaces:**
- Consumes: `getInvoice` (Task 6); `createRuleFromTransaction` em `src/app/(app)/transacoes/actions.ts` como referência do fluxo de regra.
- Produces:
  ```ts
  // credit.ts
  export async function setPurchaseCategory(db: Db, userId: string, purchaseId: string, categoryId: string | null): Promise<boolean>;
  // actions.ts
  export async function setPurchaseCategoryAction(purchaseId: string, categoryId: string | null): Promise<{ error?: string }>;
  ```

- [ ] **Step 1: Write the failing test** `setPurchaseCategory only touches own purchases` → retorna `true` e muda a categoria para o dono; `false` para outro usuário, sem alterar.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (update com `id` e `userId`; action valida `isUuid` e se a categoria é do usuário, como `createPurchaseAction` fazia). **Step 4: Run** → PASS.

- [ ] **Step 5: UI do detalhe.** Por item: data da compra (`dd/mm/aaaa`), descrição, etiqueta `k/n` quando `parcelas > 1`, `final 9109` em `text-xs text-muted-foreground` quando houver, valor (estorno com sinal negativo), `line-through` quando `pareada`. Categoria em `purchase-category.tsx`, reaproveitando o seletor e o toast "Aplicar '<descrição>' → <categoria> nas próximas?" de `transaction-row.tsx` (chamando `createRuleFromTransaction` ou extraindo a parte de regra para uma action compartilhada). Cabeçalho mostra status e "Vence em …"; botão "Marcar como paga" só quando `status === "FECHADA"`.

- [ ] **Step 6: Verify** `npx tsc --noEmit`; pedir ao usuário para abrir set/2026, ver `8/10` na AMAZON, o par Samsung riscado e mudar uma categoria.

---

### Task 9: Extrato CSV: pagamento de fatura, Débito e cores por tipo

**Files:**
- Modify: `src/domain/picpay-parser.ts`, `tests/domain/picpay-parser.test.ts`
- Modify: `src/app/globals.css` (token `--transfer`), `src/app/(app)/transacoes/transaction-row.tsx`

**Interfaces:**
- Produces: `classify(tipoOriginal: string, descricao: string, valor: number): TxType` (interno ao parser).

- [ ] **Step 1: Write the failing test** em `tests/domain/picpay-parser.test.ts`:
  ```ts
  test("invoice payment is a transfer", () => {
    const csv = `${HEADER}\n2026-10-05,11:16,"Pagamento realizado","Fatura PicPay Card","−R$ 7,25","Com saldo"\n`;
    expect(parsePicPayCsv(csv).rows[0].tipo).toBe("MOVIMENTACAO");
  });
  test("other payments keep the sign rule", () => {
    const csv = `${HEADER}\n2026-10-05,11:16,"Pagamento realizado","CONTA DE LUZ","−R$ 90,00","Com saldo"\n`;
    expect(parsePicPayCsv(csv).rows[0].tipo).toBe("GASTO");
  });
  ```
  (`HEADER` = a linha de cabeçalho do CSV usada nos testes existentes.)

- [ ] **Step 2: Run** `npx vitest run tests/domain/picpay-parser.test.ts` → FAIL no primeiro.

- [ ] **Step 3: Implement**: `pagamento realizado` + descrição normalizada começando com `FATURA` → `MOVIMENTACAO`; resto inalterado. **Step 4: Run** → PASS.

- [ ] **Step 5: UI.** Em `globals.css`, `--transfer: #94a3b8` no tema claro e no escuro (mesmos blocos de `--income`/`--expense`) e `.text-transfer { color: var(--transfer); }`. Em `transaction-row.tsx` (linha do valor, hoje `tx.valor < 0 ? "text-expense" : ""`): `GASTO` → `text-expense`, `RECEITA` → `text-income`, `MOVIMENTACAO` → `text-transfer`. Quando `formaPagamento === "Com cartão"`, etiqueta `Débito` ao lado da descrição (mesmo estilo de pílula da antiga etiqueta "Crédito": `rounded-full bg-accent px-2 py-0.5 text-xs font-medium`); passar `formaPagamento` de `transacoes/page.tsx` para a linha.

- [ ] **Step 6: Verify** `npx tsc --noEmit`, `npx vitest run` → verdes. Lembrar o usuário: transações já importadas não mudam sozinhas; ajustar o tipo da linha "Pagamento realizado / Fatura PicPay Card" na lista ou excluir e reimportar o CSV de outubro.
