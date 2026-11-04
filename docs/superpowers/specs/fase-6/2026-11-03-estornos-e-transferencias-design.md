# Estornos e transferências próprias — Especificação de Design

Data: 2026-11-03
Status: aprovado em conversa, aguardando revisão da spec
Specs relacionadas: `docs/superpowers/specs/fase-4/2026-11-02-categorias-de-receita-design.md` (categorias por tipo e regras) e `docs/superpowers/specs/fase-5/2026-11-03-fase-5-relatorios-e-investimentos-design.md` (relatórios)

## 1. Contexto e objetivo

Os números do app batem com o extrato, mas não com a vida real. Em jan/2026 as Entradas somam **R$ 6.392,48**, sendo que o salário líquido é ~R$ 3.100. A diferença vem de três lugares:

| Causa | Exemplo | Efeito |
|---|---|---|
| Pix **recebido de mim mesmo** (de outra conta minha) vira Receita | jan: 2 Pix de "RODRIGGO ALVES AREBA" = R$ 2.120 sem categoria; ~R$ 22 mil no ano | Entradas infladas |
| Pix **enviado para mim mesmo** vira Gasto | mar −2.000, jun −2.561, ago −3.606 | Gastos inflados |
| Dinheiro que **amigos devolvem** por uma compra que fiz para eles vira Receita | Gesner, "Compra de Terceiros" (17 lançamentos), Wellhub, assinaturas | Entradas infladas e gastos maiores que o real |
| "Compra estornada" e "Pix devolvido" do extrato viram Receita | 8 lançamentos, ~R$ 448 | idem |

Além disso, a categoria padrão "Transferência própria" é do tipo **Receita**: mesmo categorizada, a transferência continua somando nas Entradas.

Situação do usuário: o salário cai no **Sicoob** e é repassado ao PicPay por Pix (aparece como "Pix recebido" de "RODRIGGO ALVES AREBA"). Durante 2026 várias contas foram usadas; **daqui pra frente só o PicPay**.

**Objetivo:** Entradas = só dinheiro novo de verdade (salário, ticket, férias, freelas). Gastos = o que de fato saiu do bolso, já descontado o que foi devolvido. Transferências entre contas próprias não contam em nenhum dos dois.

**Critérios de sucesso**
- Um Pix do Gesner pagando de volta uma compra pode ser marcado como **Estorno** em "Alimentação": some das Entradas e reduz o gasto de Alimentação no Dashboard, nos Relatórios e na lista de Transações filtrada por gastos.
- Importar um extrato com "Compra estornada" ou "Pix devolvido": as linhas chegam como **Estorno**.
- Uma regra "RODRIGGO ALVES AREBA → Movimentação · Transferência própria" faz os Pix entre contas próprias, **nos dois sentidos**, não contarem como entrada nem gasto, tanto nas importações seguintes quanto nas transações antigas sem categoria.
- Uma regra "Gesner → Estorno · Alimentação" vale só para dinheiro que **entra** vindo do Gesner. Um Pix **enviado** ao Gesner continua sendo gasto.
- Card "Gastos" do Dashboard = soma da lista de Transações que ele abre.

## 2. Modelo decidido

Quatro tipos de lançamento:

| Tipo | O que é | Onde conta | Categorias |
|---|---|---|---|
| **Gasto** | dinheiro que saiu | Gastos (+) | de gasto |
| **Estorno** *(novo)* | devolução de parte de um gasto (amigo que paga de volta, compra estornada, Pix devolvido) | Gastos (−), na categoria escolhida | **as de gasto** (não tem categorias próprias) |
| **Receita** | renda de verdade | Entradas | de receita |
| **Movimentação** | dinheiro que só muda de lugar (cofrinho, fatura, transferência própria) | nada | de movimentação |

Regras do modelo:

1. **"Conta como gasto" tem uma definição só**: `countsAsExpense(tipo)` = `GASTO` ou `ESTORNO`. Todo cálculo de gasto usa essa função; nenhum lugar compara `tipo === "GASTO"` para somar gastos.
2. **O sinal faz o resto.** Estorno tem valor positivo e, por isso, reduz a categoria. É a mesma conta que já existe para créditos (`summarizeSpending` já trata uma categoria que fica negativa como "créditos"). Não há validação de sinal: um Estorno negativo se comporta como gasto, e isso é aceitável.
3. **Categoria do Estorno = categoria de gasto.** `categoryTipo(tipo)` devolve `GASTO` para `ESTORNO` e o próprio tipo nos demais. Todo seletor de categoria usa essa função.
4. **Não existe categoria do tipo Estorno.** Em Configurações, as abas de categorias continuam Gastos / Receitas / Movimentações, e `upsertCategory` recusa `ESTORNO`.
5. **"Transferência própria" passa a ser Movimentação.**
6. **Estornos do cartão também são Estorno.** A parcela de uma compra `ESTORNO` da fatura passa a ter `tipo: "ESTORNO"` no `MonthEntry` (hoje é `GASTO` com `estorno: true`), para o filtro "Estorno" mostrar os dois.

## 3. Rótulos e cores

`TIPO_LABEL`, na ordem dos seletores: Gasto, **Estorno**, Receita, Movimentação.

- Cor do valor na linha: Estorno usa `text-income` (verde, porque é dinheiro que voltou). O rótulo "Estorno" na coluna Tipo diferencia de Receita.
- Linha do cartão: a coluna Tipo mostra o tipo da entrada ("Gasto" ou "Estorno") em vez do "Gasto" fixo de hoje.
- CSV dos relatórios: usa `TIPO_LABEL`, então "Estorno" aparece automaticamente.

## 4. Importação do extrato

**Parser** (`src/domain/picpay-parser.ts`): `"compra estornada"` e `"pix devolvido"` → `ESTORNO`. O resto não muda.

**Regras ganham tipo.** Hoje uma regra é `padrão → categoria`. Ela passa a ser `padrão → tipo + categoria`:

- Nova coluna `category_rules.tipo` (`tx_type`, NOT NULL). A migração preenche com o tipo da categoria de cada regra.
- Compatibilidade: `categoryTipo(regra.tipo) === categoria.tipo`. Exemplo válido: Estorno + Alimentação.
- **Direção:** a regra só casa com lançamentos do sentido compatível com o tipo dela:
  - `GASTO` → valor < 0
  - `RECEITA` e `ESTORNO` → valor > 0
  - `MOVIMENTACAO` → qualquer sentido

  Isso resolve o mesmo nome aparecer em "Pix enviado" e "Pix recebido". Também corrige um bug de hoje: uma regra de receita podia categorizar um Pix enviado.
- **Linhas cujo tipo o parser já sabe com certeza** (Movimentação: cofrinho, pagamento de fatura; Estorno: compra estornada, Pix devolvido) só aceitam regras **do mesmo tipo**. Uma regra de Receita "Samuel" não transforma um "Pix devolvido" do Samuel em Receita. Movimentação sem regra continua na categoria "Movimentação", como hoje. Linhas Gasto e Receita do parser aceitam qualquer regra compatível com o sentido.
- Ao casar, a linha recebe a categoria **e o tipo** da regra. Exemplo: "Pix recebido" do Gesner + regra Estorno → linha Estorno em Alimentação.
- Empate entre regras continua igual: vence o padrão mais longo, agora só entre as regras compatíveis com a linha.

`matchCategory(descricao, rules)` vira `matchRule({ descricao, valor }, rules)`, que devolve `{ categoryId, tipo } | null`. `buildImportPlan` usa essa função.

**Fatura do cartão:** compras do cartão só usam regras de tipo `GASTO`, ignorando o sentido (o estorno do cartão herda a categoria da regra de gasto, como hoje).

## 5. Transações

- **Seletor de tipo da linha:** ganha "Estorno".
- **Seletor de categoria da linha:** `categoriesForType(categories, categoryTipo(row.tipo), row.categoryId)`.
- **Filtro de tipo:** a opção Gasto aparece como **"Gastos e estornos"** e traz `GASTO` + `ESTORNO`. A opção "Estorno" traz só estornos. Isso mantém o card "Gastos" do Dashboard igual à soma da lista que ele abre. O filtro de categoria, com tipo Gasto ou Estorno escolhido, mostra as categorias de gasto.
- **Criar regra a partir de uma linha** (`createRuleFromTransaction`):
  - A regra recebe o tipo atual da transação.
  - Ela é aplicada às transações **sem categoria** que casam com ela, respeitando a direção (seção 4), e grava categoria **e** tipo.
  - Hoje o filtro é "mesmo tipo da origem". Com isso, a regra de transferência própria criada num Pix recebido também pega os Pix enviados para mim mesmo.
  - Fluxo natural na tela: primeiro trocar o tipo, depois a categoria (o seletor de categoria depende do tipo), e a oferta de regra aparece.
- **Criar regra a partir de uma compra do cartão:** regra de tipo `GASTO`.

## 6. Configurações → Regras

- O formulário ganha um seletor de **Tipo** antes da categoria: Gasto / Estorno / Receita / Movimentação. A lista de categorias é filtrada por `categoryTipo(tipo)`, e trocar o tipo limpa uma categoria que fique incompatível.
- A lista mostra "contém **GESNER** → Estorno · Alimentação" (tipo · categoria).
- `upsertRule` valida o tipo e a compatibilidade tipo × categoria.
- Regras padrão de usuário novo (`DEFAULT_RULES`) recebem o tipo da categoria (todas são `GASTO`).

## 7. Cálculos que passam a usar `countsAsExpense`

| Arquivo | Hoje | Passa a |
|---|---|---|
| `src/domain/summary.ts` (`netByCategory`) | `tipo !== "GASTO"` | `!countsAsExpense(tipo)` |
| `src/domain/reports/expenses.ts` (`gastos`) | `tipo === "GASTO"` | `countsAsExpense`. Os maiores gastos continuam só com valor < 0; os estabelecimentos líquidos descontam estornos. |
| `src/domain/reports/evolution.ts` (`originSplit`) | `tipo === "GASTO"` | `countsAsExpense` |
| `src/domain/reports/categories.ts` (`categoriesInPeriod(…, "GASTO")`) | `e.tipo !== tipo` | para `GASTO`, `countsAsExpense`; para `RECEITA`, igual |
| `src/app/(app)/page.tsx` (link do card Gastos) | `some(tipo === "GASTO")` | `some(countsAsExpense)` |
| `src/domain/entries.ts` (`filterEntries`) | `e.tipo === tipo` | filtro `GASTO` aceita `countsAsExpense`; os demais, igualdade |

Entradas (Dashboard e `monthlyEvolution`) continuam somando só `RECEITA`.

## 8. Banco de dados e migrações

1. **Schema** (`src/db/schema.ts`):
   - `txType` ganha `"ESTORNO"`.
   - `categoryRules` ganha `tipo: txType("tipo").notNull()`.
   - `TxType` em `picpay-parser.ts` e as listas `TIPOS` (`guards.ts`) incluem `ESTORNO`. A lista de `configuracoes/actions.ts` usada para categorias **não** inclui.
2. **Migração de schema** (gerada pelo drizzle-kit): `ALTER TYPE "tx_type" ADD VALUE 'ESTORNO'` e a coluna `category_rules.tipo`. A coluna é adicionada como nullable, preenchida com o tipo da categoria e só então vira NOT NULL.
3. **Migração de dados** (custom, em arquivo separado):
   - `categories`: "Transferência própria" do tipo `RECEITA` passa a `MOVIMENTACAO`. As transações nela com tipo `RECEITA` passam a `MOVIMENTACAO`, e as regras que apontam para ela passam a tipo `MOVIMENTACAO`.
   - `transactions` com `tipo_original` em ("Compra estornada", "Pix devolvido") e tipo `RECEITA` passam a `ESTORNO`. Se a categoria for de receita, ela é limpa (fica sem categoria).
   - `DEFAULT_CATEGORIES`: "Transferência própria" passa a `tipo: "MOVIMENTACAO"`.
4. **Ordem de aplicação:** o Postgres não deixa usar um valor de enum novo na mesma transação em que ele foi criado, e o migrator do drizzle aplica todas as migrações pendentes numa transação só. Por isso a migração de schema é aplicada (`drizzle-kit migrate`) **antes** de a migração de dados ser gerada e aplicada, em duas execuções separadas.

## 9. Limpeza do histórico (manual, pelo usuário, depois da entrega)

As migrações não sabem quais Pix eram salário nem quais categorias do usuário são, na verdade, reembolsos. Passos sugeridos, todos pela interface:

1. Em um Pix recebido de "RODRIGGO ALVES AREBA" sem categoria: tipo **Movimentação**, categoria **Transferência própria**, e aceitar a oferta de regra. As ~36 transferências próprias sem categoria (28 recebidas e 8 enviadas) viram Movimentação de uma vez. Jan e out continuam como estão, porque já têm categoria.
2. **De fevereiro a setembro**, o Pix do salário de cada mês estava sem categoria e foi junto no passo 1. Em cada mês, trocar esse Pix para **Receita · Salário** (8 lançamentos).
3. Lançamentos nas categorias "Compra de Terceiros" (17), "Wellhub Terceiros" (3), "Assinaturas compartilhadas" (2) e "Pagamento do dinhero do emprestrimo" (1): trocar para **Estorno** com a categoria de gasto correspondente. Depois disso, essas categorias de receita podem ser apagadas em Configurações.

**Daqui pra frente:** com a regra do passo 1, o Pix mensal do salário (Sicoob → PicPay) chega como Movimentação. É preciso trocá-lo para Receita · Salário uma vez por mês. *Decisão tomada para revisão:* preferimos esse erro "para menos", em que Entradas vem zerada e o problema fica visível, ao erro "para mais" de hoje, em que a inflação passa despercebida.

## 10. Fora de escopo

- Reconhecer o salário automaticamente (por valor, dia do mês ou CNPJ).
- Vincular um estorno à compra original.
- Ação em lote ("trocar todas as transações da categoria X para Estorno em Y").
- Aviso no Dashboard de "transferência própria recebida e nenhum salário no mês".

## 11. Testes

Testes unitários (vitest) nas funções de domínio:

- `tx-type`: `countsAsExpense`, `categoryTipo`, `TIPO_LABEL` com Estorno, `parseTipo("ESTORNO")`.
- `picpay-parser`: "Compra estornada" e "Pix devolvido" → `ESTORNO`.
- `categorization`: `matchRule` respeita a direção (o mesmo padrão com Pix enviado × recebido), a regra de Movimentação casa nos dois sentidos, o padrão mais longo vence entre as compatíveis, e `newRuleTargets` usa direção em vez de "mesmo tipo".
- `import-plan`: a linha casada recebe tipo e categoria da regra, e as linhas Movimentação/Estorno do parser só aceitam regras do mesmo tipo.
- `invoice-import-plan`: só regras `GASTO` categorizam compras.
- `category-options`: Estorno lista categorias de gasto.
- `entries`: o estorno do cartão vira `ESTORNO`, e o filtro `GASTO` inclui estornos.
- `summary` e `reports/*`: um estorno reduz a categoria e o total, os maiores gastos não incluem estornos, e as Entradas não mudam.
- `guards`: aceita `ESTORNO`.
- `defaults`: "Transferência própria" é Movimentação e as regras padrão têm tipo.

Testes de banco já existentes (`tests/db/imports.test.ts`) passam a cobrir a importação gravando o tipo vindo da regra.
