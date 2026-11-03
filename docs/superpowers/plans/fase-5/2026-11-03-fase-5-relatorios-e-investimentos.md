# Fase 5 — Relatórios e Investimentos — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página de Relatórios com abas (visão geral, categorias, cartão, lançamentos, investimentos) e página de Investimentos (cofrinhos do PicPay, CDI, projeção, saldo real × esperado, simulador).

**Architecture:** O banco só busca linhas (`db/`); toda regra vive em módulos puros (`domain/`) testados no Vitest. Uma consulta por período (`getRangeEntries`) alimenta todos os relatórios e o Dashboard, para os números baterem. Investimentos são derivados das transações "Dinheiro guardado/resgatado".

**Tech Stack:** Next.js 15 (App Router, Server Actions), Drizzle + Postgres (Supabase), Recharts 3, base-ui, Tailwind 4, Vitest.

**Spec:** `docs/superpowers/specs/fase-5/2026-11-03-fase-5-relatorios-e-investimentos-design.md`

## Global Constraints

- Valores monetários sempre em centavos (inteiro); percentuais persistidos em centésimos de % (10000 = 100%, 1490 = 14,90%).
- Datas em "horário de parede" UTC; exibir com `timeZone: "UTC"`; "hoje" e "mês atual" no relógio de São Paulo (`currentMonth`).
- Toda consulta filtra por `user_id` da sessão (`requireUserId`).
- Textos da UI em português do Brasil.
- Execução pedida pelo usuário: um único commit e push ao final (sem commit por tarefa).

## Review Focus

1. Mês sem nenhum lançamento dentro do período → linha com zeros, não buraco no gráfico nem divisão por zero (Task 3: teste `fills empty months with zeros`).
2. Resgate maior que o saldo estimado (saldo anterior ao primeiro extrato) → lotes não ficam negativos; saldo estimado vai a 0 (Task 2: teste `resgate beyond balance floors at zero`).
3. Saldo real informado sem nenhum movimento anterior → vira lote novo, não divisão por zero (Task 2: teste `snapshot without movements creates lot`).
4. Descrição com `;`, aspas ou quebra de linha no CSV → campo entre aspas, aspas duplicadas (Task 5: teste `escapes separators and quotes`).
5. Resposta da API do BC vazia ou com vírgula decimal → erro tratado e fallback para cache/padrão (Task 1: teste `rejects unexpected payload`).

---

### Task 1: Cofrinho e CDI (domínio)

**Files:**
- Create: `src/domain/cofrinho.ts`, `src/domain/cdi.ts`
- Test: `tests/domain/cofrinho.test.ts`, `tests/domain/cdi.test.ts`

**Interfaces:**
- Produces:
  - `parseCofrinhoMovement(t: { tipoOriginal: string; descricao: string; valor: number }): { nome: string; valor: number } | null`
  - `COFRINHO_TIPOS = ["Dinheiro guardado", "Dinheiro resgatado"]`
  - `parseBcbCdi(json: unknown): { data: string; taxaAnual: number }`
  - `shouldFetch(ultimaBusca: Date | null, agora: Date): boolean`
  - `type CdiFonte = "MANUAL" | "BCB" | "PADRAO"`; `type Cdi = { taxaAnual: number; fonte: CdiFonte; data: string | null }`
  - `resolveCdi(i: { override: number | null; cached: { data: string; taxaAnual: number } | null }): Cdi`; `CDI_PADRAO = 1490`

- [ ] **Step 1: Testes**
  - `parseCofrinhoMovement({tipoOriginal:"Dinheiro guardado", descricao:"No cofrinho Cofrinho Turbinado", valor:-201393})` → `{ nome:"Cofrinho Turbinado", valor:201393 }`
  - resgate `"Do cofrinho Cofrinho Turbinado"`, `+3500` → `valor:-3500`; tipo `"Pix enviado"` → `null`; descrição sem prefixo → nome = descrição aparada.
  - `parseBcbCdi([{data:"31/10/2026", valor:"14.90"}])` → `{ data:"2026-10-31", taxaAnual:1490 }`; `rejects unexpected payload`: `[]`, `{}`, `[{data:"x",valor:"14,90"}]` lançam.
  - `shouldFetch(null, now)` true; mesma data em SP → false; dia anterior → true; 23:30 UTC-3 do dia X vs 02:00 UTC do dia X+1 (mesmo dia em SP) → false.
  - `resolveCdi`: override 1200 → MANUAL; só cache → BCB com a data; nada → `{ taxaAnual:1490, fonte:"PADRAO", data:null }`.
- [ ] **Step 2:** `npx vitest run tests/domain/cofrinho.test.ts tests/domain/cdi.test.ts` → FAIL (módulos inexistentes).
- [ ] **Step 3:** Implementar. Taxa em centésimos via `Math.round(Number(valor) * 100)`, rejeitando valor que não seja `/^\d+(\.\d+)?$/`.
- [ ] **Step 4:** Mesmo comando → PASS.

### Task 2: Cálculo de investimentos e simulador (domínio)

**Files:**
- Create: `src/domain/investments.ts`, `src/domain/simulator.ts`
- Test: `tests/domain/investments.test.ts`, `tests/domain/simulator.test.ts`

**Interfaces:**
- Produces (`investments.ts`):
  - `type Movement = { data: Date; valor: number }`, `type Snapshot = { data: Date; saldo: number }`, `type Rates = { cdiAnual: number; percentual: number }` (centésimos de %), `type Lot = { data: Date; principal: number; valor: number }`, `type Position = { bruto; principal; rendimento; ir; liquido }` (centavos inteiros)
  - `dailyFactor(r: Rates): number`, `businessDaysBetween(a: Date, b: Date): number`, `irRate(dias: number): number` (fração: 0.225…)
  - `buildLots(movs: Movement[], snaps: Snapshot[], r: Rates, ate: Date): Lot[]`
  - `position(lots: Lot[], em: Date): Position`
  - `project(lots: Lot[], em: Date, meses: number, r: Rates): Position`
  - `compareSnapshots(movs, snaps, r): { de: Date; ate: Date; saldoInicial; saldoFinal; movimentos; rendimentoReal; rendimentoEsperado; taxaEfetiva: number | null }[]` (`taxaEfetiva` em centésimos de %)
- Produces (`simulator.ts`): `simulate(i: { inicial; aporteMensal; meses; cdiAnual; percentual }): { linhas: { mes: number; aportado: number; bruto: number }[]; aportado; bruto; rendimento; ir; liquido }`

- [ ] **Step 1: Testes**
  - `dailyFactor({cdiAnual:1490, percentual:10000})^252` ≈ `1.149` (6 casas); 200% do CDI rende o dobro da taxa diária.
  - `businessDaysBetween(sex 2026-10-30, seg 2026-11-02)` = 1; mesmo dia = 0.
  - `irRate`: 180 → 0.225; 181 → 0.20; 360 → 0.20; 361 → 0.175; 720 → 0.175; 721 → 0.15.
  - `buildLots` com aporte de 100000 e `ate` = mesmo dia → bruto 100000; 21 dias úteis depois a 100% de 14,90% → bruto = round(100000 × f^21).
  - FIFO: aportes 1000 (jan) e 1000 (mar), resgate 1500 no mesmo dia do 2º (taxa 0) → restam lotes `[{principal:500 do de mar}]`.
  - `resgate beyond balance floors at zero`: só resgate de 500 → `position` bruto 0, nenhum lote negativo.
  - `snapshot without movements creates lot`: saldo 50000 em 2026-10-01 → um lote de 50000 nessa data.
  - Escala: aporte 1000 e saldo real 1100 no mesmo dia (taxa 0) → bruto 1100, principal 1000 (rendimento 100).
  - Movimento no mesmo dia do saldo conta antes dele (aporte 1000 e saldo 1000 no mesmo dia → bruto 1000, não 2000).
  - `position` IR: lote com rendimento 1000 e 100 dias → ir 225, líquido = bruto − 225.
  - `project(…, 12, …)` usa 252 dias úteis e idade +12 meses (alíquota 17,5% para aporte de hoje).
  - `compareSnapshots`: saldos 100000 e 101500 com aporte 1000 entre eles → `movimentos:1000, rendimentoReal:500`; esperado > 0 → `taxaEfetiva = round(percentual × 500 / esperado)`.
  - `simulate({inicial:100000, aporteMensal:0, meses:12, cdiAnual:1490, percentual:10000})` → bruto = round(100000 × f^252), ir com 17,5%; com aporte 10000 e 2 meses → `aportado:120000`, `linhas.length === 3` (meses 0..2).
- [ ] **Step 2:** `npx vitest run tests/domain/investments.test.ts tests/domain/simulator.test.ts` → FAIL.
- [ ] **Step 3:** Implementar. Algoritmo de `buildLots`: ordenar eventos por dia (movimentos antes de saldos no mesmo dia); a cada evento render os lotes de `cursor` até o dia do evento por `f^businessDays`; aporte → novo lote; resgate → consumir do mais antigo `min(lote.valor, resto)`, `principal *= (valor − retirado)/valor`, remover lotes zerados; saldo → `est = Σvalor`; `est > 0` → multiplicar `valor` de cada lote por `saldo/est`; senão novo lote `{ principal: saldo, valor: saldo }`. Ao final render até `ate`. Contas em ponto flutuante; arredondar só em `position`.
- [ ] **Step 4:** Mesmo comando → PASS.

### Task 3: Relatórios — período, evolução, categorias (domínio)

**Files:**
- Create: `src/domain/reports/period.ts`, `src/domain/reports/evolution.ts`, `src/domain/reports/categories.ts`
- Test: `tests/domain/reports/period.test.ts`, `tests/domain/reports/evolution.test.ts`, `tests/domain/reports/categories.test.ts`

**Interfaces:**
- Consumes: `MonthEntry` (`domain/entries.ts`), `summarizeSpending` (`domain/summary.ts`), `addMonths` (`domain/invoice.ts`).
- Produces:
  - `type MonthEntries = { mes: MonthKey; entries: MonthEntry[] }[]`
  - `PERIODOS = [3, 6, 12]`, `parsePeriodo(v?: string): 3 | 6 | 12` (padrão 6), `periodMonths(fim: MonthKey, n: number): MonthKey[]` (mais antigo primeiro), `fillMonths(meses: MonthKey[], dados: Map<MonthKey, MonthEntry[]>): MonthEntries`
  - `monthlyEvolution(m: MonthEntries, cats, cofrinhos: Map<MonthKey, number>): { linhas: EvolutionRow[]; totais: { entradas; gastos; saldo; poupanca: number | null; cofrinhos } }`, `EvolutionRow = { mes; entradas; gastos; saldo; poupanca: number | null; cofrinhos; saldoAcumulado }` (poupança em % com 1 casa)
  - `originSplit(m: MonthEntries): { mes; conta; cartao }[]` (gasto positivo, por origem; só tipo GASTO)
  - `categoriesInPeriod(m: MonthEntries, cats: {id;nome;cor}[], tipo: "GASTO" | "RECEITA"): CategoryPeriod[]`, `CategoryPeriod = { categoryId: string | null; nome; cor; total; media; ultimo; variacao: number | null; serie: number[] }`

- [ ] **Step 1: Testes**
  - `periodMonths("2026-11", 3)` → `["2026-09","2026-10","2026-11"]`; virada de ano `("2026-01",3)` → `["2025-11","2025-12","2026-01"]`; `parsePeriodo("12")` → 12, `"7"`/`undefined` → 6.
  - `fills empty months with zeros`: `fillMonths(["2026-10","2026-11"], new Map([["2026-11",[…]]]))` tem 2 itens, out vazio; `monthlyEvolution` dá `entradas:0, gastos:0, poupanca:null` para out.
  - Evolução: receita 500000 e gasto −200000 → `saldo:300000, poupanca:60`; `saldoAcumulado` soma mês a mês; `gastos` igual a `summarizeSpending(entries,cats).total` (inclui crédito que zera categoria); cofrinhos vêm do mapa.
  - `originSplit`: gasto CONTA −100 e CARTAO −300 → `{conta:100, cartao:300}`; RECEITA ignorada.
  - Categorias: GASTO em 3 meses `[100,200,600]` → `total:900, media:300, ultimo:600, variacao:300` (600 vs média 150 dos anteriores = +300%); um mês só → `variacao:null`; categoria com total ≤ 0 some; `tipo:"RECEITA"` soma valores positivos de entradas RECEITA; sem categoria → nome "Sem categoria".
- [ ] **Step 2:** `npx vitest run tests/domain/reports` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Mesmo comando → PASS.

### Task 4: Relatórios — cartão, gastos e investimentos (domínio)

**Files:**
- Create: `src/domain/reports/card.ts`, `src/domain/reports/expenses.ts`, `src/domain/reports/investments.ts`
- Test: `tests/domain/reports/card.test.ts`, `tests/domain/reports/expenses.test.ts`, `tests/domain/reports/investments.test.ts`

**Interfaces:**
- Consumes: `MonthEntries` (Task 3), `buildLots`/`position`/`Movement`/`Snapshot`/`Rates` (Task 2), `dueMonth`/`CardDays` (`domain/invoice.ts`).
- Produces:
  - `type UnpaidInstallment = { mes: MonthKey; vencimento: Date; status: "FECHADA" | "PROJETADA"; purchaseId; descricao; numero; parcelas; valor }`
  - `futureCommitment(rows: UnpaidInstallment[]): { faturas: { mes; vencimento; status; total; parcelado; avista }[]; parcelamentos: { purchaseId; descricao; valorParcela; proxima; parcelas; restantes; restante; ultimoVencimento: Date }[]; livreEm: Date | null; total }` — faturas por `mes` crescente; parcelamentos só `parcelas > 1`, ordenados por `ultimoVencimento`; `livreEm` = vencimento da última fatura com parcela de compra parcelada.
  - `installmentMix(m: MonthEntries): { mes; avista; parcelado }[]` (só `origem === "CARTAO"`, valor positivo = gasto)
  - `topExpenses(m: MonthEntries, n: number): MonthEntry[]`, `normalizeMerchant(d: string): string`, `topMerchants(m: MonthEntries, n: number): { nome; total; vezes }[]`
  - `investmentsInPeriod(i: { meses: MonthKey[]; investimentos: { movs: Movement[]; snaps: Snapshot[]; rates: Rates }[]; hoje: Date }): { linhas: { mes; aportes; resgates; saldo }[]; saldoHoje: number; rendimento: number; aportado: number }`
  - `cofrinhoByMonth(movs: Movement[]): Map<MonthKey, number>` (líquido por mês)

- [ ] **Step 1: Testes**
  - `futureCommitment`: compra 3x de 1000 em faturas 11, 12, 01 + à vista 500 na 11 → fatura 11 `{total:1500, parcelado:1000, avista:500}`; parcelamento `{restantes:3, restante:3000, proxima:1}`; `livreEm` = vencimento da fatura 01; sem linhas → `livreEm:null, total:0`.
  - `installmentMix`: CardEntry com `parcela` −300 e sem parcela −200 → `{parcelado:300, avista:200}`; estorno (valor positivo) abate do grupo correto.
  - `topExpenses(m, 2)` devolve os 2 gastos de maior valor absoluto; ignora RECEITA/MOVIMENTACAO.
  - `normalizeMerchant("  Uber   *Trip 2/10 ")` → `"UBER *TRIP"`; `topMerchants` soma e conta pelo nome normalizado, maior total primeiro.
  - `investmentsInPeriod`: aporte 100000 em 2026-10-05, taxa 0, meses `["2026-10","2026-11"]`, hoje 2026-11-03 → linhas `[{aportes:100000, resgates:0, saldo:100000}, {aportes:0, resgates:0, saldo:100000}]`, `rendimento:0`, `aportado:100000`; saldo do mês corrente medido em `hoje`, não no fim do mês.
- [ ] **Step 2:** `npx vitest run tests/domain/reports` → FAIL nos novos.
- [ ] **Step 3:** Implementar. Rendimento do período = saldo final − saldo no fim do mês anterior ao período − movimentos líquidos do período.
- [ ] **Step 4:** Mesmo comando → PASS.

### Task 5: Exportação CSV (domínio)

**Files:**
- Create: `src/domain/reports/csv.ts`
- Test: `tests/domain/reports/csv.test.ts`

**Interfaces:**
- Consumes: `MonthEntries`, `TIPO_LABEL`.
- Produces: `entriesToCsv(m: MonthEntries, cats: { id; nome }[]): string`

- [ ] **Step 1: Testes** — começa com `﻿` e cabeçalho `Data;Mês;Descrição;Tipo;Categoria;Origem;Parcela;Valor`; linha de gasto `-1234` → `…;-12,34`; data `31/10/2026`; origem `Conta`/`Cartão`; parcela `2/10`; `escapes separators and quotes`: descrição `a;"b"` → `"a;""b"""`; sem lançamentos → só cabeçalho; ordem mais antigo primeiro.
- [ ] **Step 2:** `npx vitest run tests/domain/reports/csv.test.ts` → FAIL.
- [ ] **Step 3:** Implementar; separador de linha `\r\n`.
- [ ] **Step 4:** → PASS.

### Task 6: Esquema, migrações e acesso a dados

**Files:**
- Modify: `src/db/schema.ts` (4 tabelas), `src/db/entries.ts` (`getRangeEntries`)
- Create: `drizzle/0007_*.sql` (gerada), `drizzle/0008_investimentos_rls.sql` (custom), `src/db/investments.ts`, `src/db/cdi.ts`, `src/db/reports.ts`
- Test: `tests/db/entries.test.ts` (integração, pulada sem `TEST_DATABASE_URL`)

**Interfaces:**
- Produces:
  - `getRangeEntries(db, userId, de: MonthKey, ate: MonthKey): Promise<Map<MonthKey, MonthEntry[]>>`; `getMonthEntries` delega.
  - `getCofrinhoMovements(db, userId): Promise<{ nome: string; data: Date; valor: number }[]>`
  - `syncInvestments(db, userId): Promise<void>`, `listInvestments(db, userId)` → `{ id; nome; percentualCdi }[]` por nome
  - `listSnapshots(db, userId)` → `{ id; investmentId; data; saldo }[]` por data
  - `getCdi(db, userId): Promise<Cdi>`
  - `getUnpaidInstallments(db, userId): Promise<UnpaidInstallment[]>`

- [ ] **Step 1:** Tabelas conforme spec §3 (`investments` com `unique(user_id, nome)` e `percentual_cdi default 10000`; `investment_snapshots` com `unique(investment_id, data)` e FK cascade; `cdi_rates` PK `data`; `cdi_overrides` PK `user_id`).
- [ ] **Step 2:** `npx drizzle-kit generate --name investimentos` e `npx drizzle-kit generate --custom --name investimentos_rls` com `ALTER TABLE … ENABLE ROW LEVEL SECURITY` nas 4 tabelas. `npx drizzle-kit check` sem erros.
- [ ] **Step 3:** `getRangeEntries`: extrato com `data_hora` em `[início(de), fim(ate))`, parcelas com `invoices.mes` entre `de` e `ate`; agrupa por `monthKey(dataHora)` / `invoices.mes`; `buildMonthEntries` por mês. Teste de integração: transação em out e nov, fatura de nov → mapa com as duas chaves.
- [ ] **Step 4:** `getCdi`: lê override e a linha mais recente; se `shouldFetch(max(buscado_em))`, `fetch` SGS 4389 com `AbortSignal.timeout(5000)` e `cache: "no-store"`, `parseBcbCdi`, upsert; qualquer erro → segue com o cache; `resolveCdi`. Quando a fonte é a API, `fonte: "BCB"`.
- [ ] **Step 5:** `npx vitest run` → suíte inteira PASS (integração pulada); `npx tsc --noEmit` limpo.

### Task 7: Navegação

**Files:**
- Modify: `src/components/app-nav.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `src/app/(app)/transacoes/page.tsx`

- [ ] **Step 1:** `NAV` = Visão geral, Transações, Cartão, Relatórios (`BarChart3`, `/relatorios`), Investimentos (`PiggyBank`, `/investimentos`, curto "Investir").
- [ ] **Step 2:** Cabeçalho: link ícone `Settings2` para `/configuracoes` (`aria-label="Configurações"`) antes do `ThemeToggle`.
- [ ] **Step 3:** Botão "Importar extrato" (`Upload`, link para `/importar`) no topo do Dashboard e de Transações, ao lado do `MonthPicker`.
- [ ] **Step 4:** `npx tsc --noEmit` limpo.

### Task 8: Página de Relatórios

**Files:**
- Create: `src/app/(app)/relatorios/page.tsx`, `src/app/(app)/relatorios/tabs.tsx` (links de abas), `src/app/(app)/relatorios/period-select.tsx` (reusa `SearchParamSelect`), `src/app/(app)/relatorios/charts.tsx` (client: `EvolutionChart`, `StackedMonthsChart`, `BalanceChart`), seções `overview.tsx`, `categories.tsx`, `card.tsx`, `expenses.tsx`, `investments.tsx`, `src/app/(app)/relatorios/exportar/route.ts`, `src/components/stat-tile.tsx` (se o `Stat` do Dashboard for extraído)

**Interfaces:**
- Consumes: Tasks 3–6.

- [ ] **Step 1:** `page.tsx` lê `mes`, `periodo`, `aba`; calcula só a aba aberta; cabeçalho com título, `MonthPicker` (fim do período) e seletor de período; estado vazio sem meses → link para importar.
- [ ] **Step 2:** Seções conforme spec §6.2, com links para Transações (`transactionsHref`) onde houver mês e categoria.
- [ ] **Step 3:** `exportar/route.ts`: `GET` com `requireUserId`, mesma janela de meses, resposta `text/csv; charset=utf-8` com `Content-Disposition: attachment; filename="ledger-<de>-a-<ate>.csv"`.
- [ ] **Step 4:** `npx tsc --noEmit` e `npx eslint` limpos.

### Task 9: Página de Investimentos e Simulador

**Files:**
- Create: `src/app/(app)/investimentos/page.tsx`, `actions.ts`, `cdi-card.tsx`, `cofrinho-card.tsx`, `snapshot-form.tsx`, `percent-form.tsx`, `simulator.tsx` (client)

**Interfaces:**
- Consumes: Tasks 1, 2, 6.
- Produces (server actions): `setInvestmentPercent(id: string, percentual: string)`, `addSnapshot(investmentId: string, saldo: string, data: string)`, `deleteSnapshot(id: string)`, `setCdiOverride(taxa: string | null)` → `{ error?: string }`.

- [ ] **Step 1:** Ações com validação da spec §7 (`"102"`/`"102,5"` → 10200/10250; saldo em reais com vírgula → centavos; data `AAAA-MM-DD` ≤ hoje em SP); `revalidatePath("/investimentos")` e `"/relatorios"`.
- [ ] **Step 2:** `page.tsx`: `syncInvestments`, depois em paralelo investimentos, movimentos, snapshots e CDI; card do CDI; card por cofrinho (posição hoje, projeção 1/3/6/12, comparação de saldos); estado vazio.
- [ ] **Step 3:** Simulador client com `simulate`, campos pré-preenchidos com o CDI em uso e 100%; gráfico de área (aportado × bruto).
- [ ] **Step 4:** `npx tsc --noEmit` e `npx eslint` limpos.

### Task 10: Verificação final, docs, commit, push e release

- [ ] **Step 1:** `npx vitest run` → todos PASS; `npx tsc --noEmit`; `npx eslint`; `npx next build` (sem servidor de dev rodando) → sucesso.
- [ ] **Step 2:** Spec geral: Fase 5 aponta para esta spec; telas 6/7 atualizadas; menu.
- [ ] **Step 3:** `git add -A` (sem arquivos pessoais: CSV/PDF de extrato já ignorados ou fora do commit), commit, `git push origin main`.
- [ ] **Step 4:** Release `v0.5.0` no GitHub com descrição do app (API REST com a credencial do git, já que `gh` não está instalado).
