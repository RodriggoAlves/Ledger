# Fase 5 — Relatórios e Investimentos (cofrinhos) — Design

Data: 2026-11-03
Status: aprovado em conversa; o usuário pediu execução direta (spec → plano → implementação → push) sem revisão intermediária.
Substitui a seção 6 da spec geral (`geral/2026-11-01-financas-design.md`) onde houver conflito.

## 1. Objetivo

Uma visão geral do período (vários meses) com o que o app já sabe — extrato, cartão, faturas e categorias — e os investimentos do usuário, que hoje são **somente cofrinhos do PicPay atrelados ao CDI**.

**O que o usuário decidiu**
- Relatórios "um pouco de tudo", em uma página com abas. Ficaram de fora: ritmo do mês com projeção, gastos por dia da semana/dia do mês e detecção de gastos recorrentes.
- Investimentos entram na mesma spec e no mesmo plano, com as quatro partes: CDI automático, projeção, saldo real × esperado e simulador.
- Investimentos **automáticos pelo extrato**: cada cofrinho citado em "Dinheiro guardado"/"Dinheiro resgatado" vira um investimento.
- Navegação: Relatórios e Investimentos entram no menu; Simulador vira aba de Investimentos; Importar sai do menu (vira botão); Configurações vira ícone no cabeçalho.
- Poupança do mês = entradas − gastos (igual ao Dashboard); o que foi para os cofrinhos aparece à parte.
- Arquitetura: consulta por período + funções puras de domínio (abordagem 1).

**Critérios de sucesso**
- Para qualquer mês, os números de Relatórios batem com os do Dashboard (mesma lista de lançamentos, mesmas regras).
- Os cofrinhos aparecem sem cadastro; o usuário só ajusta o % do CDI e informa o saldo real quando quiser.
- O app funciona sem a API do Banco Central (usa o último CDI salvo ou um valor manual).

## 2. Dados disponíveis e premissas

- O extrato traz `tipo = "Dinheiro guardado"` com `origem/destino = "No cofrinho <nome>"` (valor negativo) e `"Dinheiro resgatado"` com `"Do cofrinho <nome>"` (valor positivo). Essas linhas já são gravadas como `MOVIMENTACAO` em `transactions` (`tipo_original`, `descricao`).
- Saldo que existia antes do primeiro extrato importado é desconhecido até o usuário informar um saldo real.
- O CDI usado em todos os cálculos é o **atual** (não há histórico de CDI). É uma estimativa; o saldo real informado corrige a base.
- Dias úteis = segunda a sexta (feriados ignorados). Mês de projeção = 21 dias úteis.
- IOF (resgates com menos de 30 dias) é ignorado.

## 3. Esquema (migração 0007 + RLS 0008)

```
investments           id, user_id, nome (único por user), percentual_cdi (int, centésimos de %: 10000 = 100%),
                      criado_em
investment_snapshots  id, user_id, investment_id (cascade), data (timestamp, dia em UTC), saldo (centavos),
                      informado_em; único (investment_id, data)
cdi_rates             data (text "AAAA-MM-DD", PK), taxa_anual (int, centésimos de %: 1490 = 14,90%), buscado_em
cdi_overrides         user_id (PK), taxa_anual (int, centésimos de %), atualizado_em
```

- `cdi_rates` é cache global (sem `user_id`), como já previa a spec geral.
- RLS ligada nas quatro tabelas, como nas migrações 0001 e 0003 (bloqueia a API pública; o app usa o papel dono).
- Não há tabela de movimentações: aportes e resgates são lidos de `transactions`.

## 4. Domínio (módulos puros, testados no Vitest)

### 4.1 `domain/cofrinho.ts`
`parseCofrinhoMovement({ tipoOriginal, descricao, valor })` → `{ nome, valor }` ou `null`.
- "dinheiro guardado" → aporte, `valor = -valor` (positivo); "dinheiro resgatado" → resgate, `valor = -valor` (negativo).
- `nome` = descrição sem o prefixo "No cofrinho " / "Do cofrinho " (sem diferenciar maiúsculas); se não houver prefixo, a descrição inteira. Espaços extras removidos.

### 4.2 `domain/cdi.ts`
- `parseBcbCdi(json)`: resposta da série SGS 4389 (`[{ data: "dd/mm/aaaa", valor: "14.90" }]`) → `{ data: "AAAA-MM-DD", taxaAnual: 1490 }`; lança erro em formato inesperado.
- `shouldFetch(ultimaBusca, agora)`: verdadeiro se nunca buscou ou se a última busca foi em outro dia (relógio de São Paulo).
- `resolveCdi({ override, cached })`: manual vence; senão o cache; senão padrão `1365` (13,65%, CDI de out/2026) com fonte `PADRAO`. Fontes: `MANUAL | BCB | PADRAO`.

### 4.3 `domain/investments.ts`
Tipos: `Movement { data, valor }` (+ aporte, − resgate, centavos), `Snapshot { data, saldo }`, `Rates { cdiAnual, percentual }` (centésimos de %).
- `dailyFactor(rates)` = `1 + ((1 + cdi)^(1/252) − 1) × percentual`. (Corrige a fórmula da spec geral, que aplicava o % sobre a taxa anual; o rendimento "% do CDI" incide sobre a taxa diária.)
- `businessDaysBetween(a, b)`: dias seg–sex em (a, b].
- `irRate(dias)`: ≤180 → 22,5%; ≤360 → 20%; ≤720 → 17,5%; acima → 15%.
- **Lotes** (`{ data, principal, valor }`) guardam idade e custo de cada aporte para o IR regressivo:
  - aporte cria lote; resgate consome do mais antigo para o mais novo (FIFO), reduzindo `principal` na mesma proporção do valor retirado;
  - saldo real informado: o app calcula o saldo estimado naquele dia; se > 0, escala valor **e** principal de todos os lotes pela razão real/estimado (assim um saldo anterior ao primeiro extrato não vira "rendimento" e não infla o IR); se 0, cria um lote com o saldo na data informada;
  - movimento no mesmo dia de um saldo informado conta como **anterior** a ele.
- `buildLots(movements, snapshots, rates, ate)`: aplica tudo em ordem e rende até `ate`.
- `position(lots, em)`: `{ bruto, principal, rendimento, ir, liquido }` em centavos (arredondados).
- `project(lots, em, meses, rates)`: posição após `21 × meses` dias úteis, com idade do IR avançando `meses` meses de calendário. Usado para 1, 3, 6 e 12 meses.
- `compareSnapshots(movements, snapshots, rates)`: para cada par consecutivo de saldos: `movimentos` (líquido no intervalo), `rendimentoReal = final − inicial − movimentos`, `rendimentoEsperado` (simulação partindo do saldo inicial), `taxaEfetiva = percentual × real / esperado` (null se esperado ≤ 0).

### 4.4 `domain/simulator.ts`
`simulate({ inicial, aporteMensal, meses, cdiAnual, percentual })` → linhas por mês `{ mes, aportado, bruto }` e totais `{ aportado, bruto, rendimento, ir, liquido }`. O inicial entra no mês 0; cada aporte no fim de cada mês; cada mês rende 21 dias úteis; o IR usa a idade de cada aporte em meses de calendário (365,25/12 dias por mês; 12 meses = 365 dias → 17,5%). Prazo de 1 a 600 meses.

### 4.5 `domain/reports/*`
Entrada comum: `MonthEntries = { mes, entries: MonthEntry[] }[]` do mais antigo ao mais novo.
- `period.ts` — `periodMonths(fim, n)`, `parsePeriodo(v)` (3, 6 ou 12; padrão 6).
- `evolution.ts` — `monthlyEvolution(meses, categorias, cofrinhoPorMes)` → por mês `{ mes, entradas, gastos, saldo, poupanca (% ou null), cofrinhos, saldoAcumulado }` + totais. `gastos` usa `summarizeSpending` (mesma regra do Dashboard); `poupanca = saldo / entradas` quando entradas > 0. `originSplit(meses)` → gasto por mês em conta e cartão.
- `categories.ts` — `categoriesInPeriod(meses, categorias, tipo)` (GASTO ou RECEITA) → por categoria `{ total, media, ultimo, variacao, serie[] }`, só totais > 0, maior primeiro. `variacao` = último mês vs média dos meses anteriores do período (null sem base).
- `card.ts` — `futureCommitment(linhas, dias do cartão)` (faturas não pagas: total, parcelado, à vista, vencimento; parcelamentos ativos com parcelas restantes e última fatura; mês em que acabam as parcelas) e `installmentMix(meses)` (gasto no cartão por mês, à vista × parcelado).
- `expenses.ts` — `topExpenses(meses, n)` (maiores lançamentos de gasto) e `topMerchants(meses, n)` (descrição normalizada: maiúsculas, espaços colapsados, sem sufixo "n/m"; soma e contagem).
- `csv.ts` — `entriesToCsv(meses, categorias)`: `;` como separador, vírgula decimal, BOM UTF-8, aspas quando necessário. Colunas: Data, Mês, Descrição, Tipo, Categoria, Origem, Parcela, Valor.
- `investments.ts` — `investmentsInPeriod(...)`: por mês, aportes, resgates e saldo estimado no fim do mês (soma dos cofrinhos); rendimento estimado no período = saldo final − saldo inicial − movimentos líquidos.

## 5. Acesso a dados

- `db/entries.ts`: `getRangeEntries(db, userId, de, ate)` busca extrato com data no intervalo e parcelas de faturas com `mes` no intervalo, agrupa por mês e monta cada mês com `buildMonthEntries`. `getMonthEntries` passa a delegar para ela.
- `db/investments.ts`: `syncInvestments` (cria investimento para cada cofrinho novo, `ON CONFLICT DO NOTHING`, 100% do CDI), `listInvestments`, `getCofrinhoMovements` (transações com `tipo_original` de cofrinho → `parseCofrinhoMovement`), `listSnapshots`, ações de % do CDI e de saldo real.
- `db/cdi.ts`: `getCdi(userId)` — busca na API no máximo 1×/dia (timeout de 5 s), grava em `cdi_rates`; em falha usa o cache; aplica o override.
- `db/reports.ts`: `getUnpaidInstallments` — parcelas ativas de faturas não pagas, com descrição, número, total de parcelas e mês da fatura.

## 6. Telas

### 6.1 Navegação
Menu: Visão geral, Transações, Cartão, Relatórios, Investimentos (5 itens; cabem na barra do celular). Cabeçalho: ícone de Configurações + tema + Sair. Botão "Importar extrato" no topo do Dashboard e de Transações (o Cartão já tem a importação de PDF na própria tela).

### 6.2 Relatórios (`/relatorios`)
Parâmetros: `?mes=` (último mês do período, padrão mês atual), `?periodo=` (3, 6, 12), `?aba=` (`geral`, `categorias`, `cartao`, `lancamentos`, `investimentos`). Abas são links (renderização no servidor, só a aba aberta é calculada).
- **Visão geral**: números do período (entradas, gastos, saldo, poupança média, enviado aos cofrinhos); gráfico de entradas × gastos com linha de saldo acumulado; tabela mês a mês; conta × cartão.
- **Categorias**: gastos por categoria (total, média, último mês, variação) com gráfico empilhado por mês (6 maiores + "Outras"); fontes de receita na mesma tabela.
- **Cartão**: próximas faturas (gráfico e lista), parcelamentos ativos, "livre das parcelas em"; à vista × parcelado no período.
- **Lançamentos**: 10 maiores gastos; 10 estabelecimentos com mais gasto; botão "Exportar CSV" (`/relatorios/exportar?mes=&periodo=`).
- **Investimentos**: saldo estimado hoje, aportes e resgates por mês, saldo estimado no fim de cada mês, rendimento estimado no período; link para Investimentos.

### 6.3 Investimentos (`/investimentos`, abas `?aba=cofrinhos|simulador`)
- **CDI**: taxa em uso, fonte e data; formulário para taxa manual e botão para voltar à automática.
- **Cofrinhos**: um card por cofrinho com saldo estimado hoje (bruto e líquido), aportado líquido, % do CDI editável, último saldo real, projeção 1/3/6/12 meses (bruto e líquido), formulário "Informar saldo real" (valor e data, padrão hoje) e histórico de fechamentos (real × esperado, taxa efetiva, excluir).
- **Simulador**: valor inicial, aporte mensal, prazo (meses), % do CDI e CDI (pré-preenchidos); resultado com total aportado, bruto, rendimento, IR e líquido, e gráfico mês a mês (aportado × saldo). Calcula no navegador com `simulate`.
- Estado vazio: "Nenhum cofrinho nos extratos importados".

## 7. Erros e validação
- API do BC fora do ar ou resposta inválida: usa o cache; sem cache, 13,65% (CDI de out/2026) com aviso "CDI padrão — informe a taxa".
- Parâmetros inválidos na URL caem nos padrões.
- Ações: % do CDI entre 1% e 300%; CDI manual entre 0,01% e 100%; saldo ≥ 0; data válida e não futura; investimento precisa ser do usuário.
- Exportação sem lançamentos gera CSV só com o cabeçalho.

## 8. Testes
- Unitários para todo `domain/` novo: cofrinho, cdi, investments (fator diário, dias úteis, IR, lotes/FIFO, escala por saldo real, projeção, comparação), simulator, reports (período, evolução, categorias, cartão, gastos, CSV, investimentos).
- Integração (pulada sem `TEST_DATABASE_URL`, como as existentes) para `getRangeEntries`.
- Verificação final: `vitest run`, `tsc --noEmit`, `eslint`, `next build`.

## 9. Fora do escopo
Ritmo do mês, hábitos por dia, recorrentes; investimentos fora dos cofrinhos; histórico de CDI; feriados; IOF.

## 10. Implantação
A migração 0007/0008 precisa ser aplicada no banco (`npx drizzle-kit migrate`) antes de usar Investimentos e a aba Investimentos de Relatórios.
