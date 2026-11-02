# Fase 4 — Fatura do cartão no Dashboard e em Transações — Especificação de Design

Data: 2026-11-02
Status: aprovado em conversa, aguardando revisão da spec
Specs relacionadas: `docs/superpowers/specs/geral/2026-11-01-financas-design.md` (seções 7 e 8) e `docs/superpowers/specs/fase-3/2026-11-01-fase-3-fatura-picpay-design.md` (seção 8, Dashboard)

## 1. Contexto e objetivo

O Dashboard soma duas fontes: as transações do extrato (`transactions`) e as parcelas das faturas do cartão (`installments`, pelo mês de fechamento da fatura). A tela Transações só lê `transactions`. Por isso, ao clicar numa categoria do Dashboard, a lista não mostra a parte do valor que veio do cartão.

Exemplo real (out/2026, categoria Setup):

| Origem | Registros | Valor |
|---|---|---|
| Extrato | 1 | R$ 600,00 |
| Fatura | 4 parcelas | R$ 3.733,59 |
| Dashboard mostra | | R$ 4.333,59 |
| Transações lista | 1 | R$ 600,00 |

**Objetivo:** todo número do Dashboard tem correspondência exata com uma lista que o usuário consegue abrir em Transações, e o Dashboard mostra quanto dos gastos do mês foi no cartão.

**Critérios de sucesso**
- Clicar numa categoria do Dashboard abre em Transações uma lista cujo total é igual ao valor da categoria.
- O card "Fatura do cartão" mostra o valor exato da fatura do mês (R$ 5.879,10 em out/2026) e, ao clicar, abre em Transações as compras dessa fatura, com o mesmo total.
- As compras do cartão aparecem uma a uma em Transações, identificadas como compra no crédito.

## 2. Regras decididas

1. **Competência.** O mês de uma compra do cartão é o mês em que a fatura **fecha**: o mês mostra o que foi gasto no cartão nele. Em out/2026 entra a fatura que fecha em 29/10 e vence em 05/11. O Dashboard já soma assim hoje; continua igual.
2. **Uma linha por parcela.** Em Transações, cada linha do cartão é uma parcela da fatura que fecha no mês, com a data original da compra e a indicação `k/n` quando parcelada. Em outubro aparece, por exemplo, "AMAZON BR 9/10" com data 21/02/2026; uma compra de 30/10 só aparece em novembro.
3. **Gastos = débito + crédito.** O card Gastos continua sendo o total do mês. O novo card **Fatura do cartão** mostra quanto desse total foi no cartão.
4. **O card mostra o valor exato da fatura**: o que o banco cobra (compras menos estornos e créditos, sem o pagamento da fatura anterior). Set/2026: R$ 7,25; out/2026: R$ 5.879,10.
5. **Sem tratamento especial para o "pula compra".** A fatura é seguida como vem: o crédito reduz o mês em que aparece e a cobrança ("FIN …") soma no mês em que aparece.
6. **Crédito que deixa uma categoria negativa reduz o total de Gastos.** Hoje essa categoria é descartada (tratada como zero). Ela continua fora do gráfico, e o valor aparece numa linha "Créditos e estornos" para os números fecharem.
7. **Edição de linhas do cartão em Transações:** só a categoria, valendo para a compra inteira (todas as parcelas, inclusive meses passados), com a oferta de criar regra. O tipo é fixo (Gasto).
8. **Filtro de origem e total em Transações:** filtro visível (Todas · Conta · Cartão) e total da lista filtrada.
9. **Meses com fatura projetada** aparecem normalmente; o card fica marcado como projetado.
10. **O Dashboard abre no mês atual do calendário.** Já está no working tree (`currentMonth()` e `MonthPicker`, ainda não commitados) e vale também para Transações; esta fase não muda isso.

## 3. Lançamentos do mês

Uma única função monta a lista de **lançamentos** de um mês. Dashboard, card e Transações usam a mesma lista; é o que garante que os números não divergem.

| Campo | Conta (extrato) | Cartão (parcela) |
|---|---|---|
| origem | `CONTA` | `CARTAO` |
| id | id da transação | id da parcela |
| data | data e hora da transação | data original da compra |
| descrição | descrição da transação | descrição da compra |
| valor (centavos, com sinal) | como no extrato | −(valor da parcela): compra negativa, estorno positivo |
| tipo | Gasto, Receita ou Movimentação | sempre Gasto |
| categoria | da transação | da compra |
| extras | forma de pagamento | id da compra, parcela `k/n` (quando parcelas > 1), se é estorno |

**Regra do mês**
- Conta: transações com data no mês (horário de parede, como hoje).
- Cartão: parcelas não canceladas de faturas cujo mês de fechamento é o mês. Faturas projetadas entram.

**Ordem:** data, da mais recente para a mais antiga; empate pela descrição.

**Identidades que precisam valer em qualquer mês**
- Gastos do Dashboard = −(soma dos lançamentos de tipo Gasto).
- Valor de cada categoria no Dashboard = −(soma dos lançamentos de tipo Gasto daquela categoria).
- Card "Fatura do cartão" = −(soma dos lançamentos de origem Cartão) = total da fatura que fecha no mês.

## 4. Dashboard

**Gastos:** total = soma das categorias positivas + créditos (regra 6 da seção 2). Saldo, porcentagem gasta e o card Gastos usam esse total.

**Card "Fatura do cartão"** (novo, junto de Entradas, Gastos e Onde mais gastou):

| Situação da fatura que fecha no mês | Valor | Texto de apoio | Clique |
|---|---|---|---|
| Paga | total da fatura | `Paga · vence 05/10/2026` | `/transacoes?mes=AAAA-MM&origem=CARTAO` |
| Fechada (importada, não paga) | total da fatura | `Fechada · vence 05/11/2026` | idem |
| Projetada | total já conhecido | `Projetada · a fatura ainda não fechou` | idem |
| Sem fatura no mês | `—` | `Nenhuma fatura neste mês` | não clicável |

**Gastos por categoria**
- Gráfico e lista mostram só categorias com valor positivo; a porcentagem é sobre a soma delas.
- Quando houver créditos (categorias negativas), a lista termina com a linha `Créditos e estornos` e o valor negativo. A linha não é clicável.
- Clicar numa categoria continua abrindo `/transacoes?mes=…&categoria=…&tipo=GASTO`; agora a lista inclui as linhas do cartão.

## 5. Transações

- **Filtros:** mês, categoria, tipo e o novo **origem** (`Todas as origens`, `Conta`, `Cartão`; parâmetro `origem=CONTA|CARTAO`).
- **Total:** acima da tabela, `N lançamentos · <soma com sinal>` (ex.: `64 lançamentos · -R$ 5.879,10`). É a soma do que está na lista; sem filtro de tipo, inclui receitas e movimentações.
- **Linhas da conta:** como hoje (tipo e categoria editáveis, etiqueta `Débito` para "Com cartão").
- **Linhas do cartão:**
  - data `dd/mm/aaaa`, sem hora;
  - etiqueta `Compra no crédito` e, quando parcelada, `k/n`; estornos e créditos da fatura levam `Estorno no crédito`;
  - tipo exibido como "Gasto", sem edição;
  - categoria editável, gravada na compra (todas as parcelas), com a oferta "Aplicar '<descrição>' → <categoria> nas próximas importações e nas compras sem categoria?";
  - valor: compra em vermelho, estorno em verde.
- Sem nome de banco nas etiquetas.

## 6. O que não muda

- Tela Cartão: lista, detalhe e histórico de importações (nomes pelo mês de vencimento).
- Importação de extrato e de fatura.
- Banco de dados: nenhuma migração.

## 7. Impactos

| Área | Impacto |
|---|---|
| Gastos do Dashboard | Só muda em mês com categoria negativa. Com os dados atuais (ago–nov/2026) **nenhuma categoria fica negativa**, então nenhum total muda hoje. A regra protege meses futuros com crédito maior que as compras de uma categoria. |
| Transações | Passa a listar as parcelas do cartão (~60–80 por mês). Sem paginação, como hoje. |
| Meses projetados | Novembro/2026 mostra como gasto os R$ 757,61 já conhecidos, com o card "Projetada". |
| Código removido | Leitura antiga de transações por mês e de parcelas por mês, e a soma por categoria que descartava negativas: substituídas pela lista de lançamentos. |

## 8. Testes

Testes puros (sem banco):
- montagem dos lançamentos: sinal, data, categoria da compra, `k/n` só quando parcelada, parcela cancelada fora, ordem;
- filtros (categoria, inclusive "sem categoria"; tipo; origem) e total;
- etiquetas de cada tipo de linha;
- resumo de gastos: categoria negativa vira crédito e reduz o total;
- **consistência** num mês com "pula compra": Gastos = −soma dos Gastos; cada categoria = −soma filtrada por ela; card = −soma do Cartão = total da fatura;
- card da fatura: valor, texto e link em cada situação da tabela da seção 4.

Testes de banco (pulados sem `TEST_DATABASE_URL`, como os da Fase 3): a consulta do mês traz as duas origens, exclui parcelas canceladas e dados de outro usuário; a fatura do mês é encontrada pelo mês de fechamento.

## 9. Decisões de detalhe para confirmar na revisão

Não foram discutidas uma a uma; seguem o que foi decidido, mas vale conferir:
1. Linhas do cartão mostram a data com ano e sem hora (a parcela pode ser de compra de outro mês ou ano).
2. Card sem fatura no mês mostra `—`.
3. Fatura paga mostra `Paga · vence dd/mm/aaaa`.
4. Rótulos do filtro: `Todas as origens`, `Conta`, `Cartão`.
5. A linha `Créditos e estornos` não é clicável.
6. A categoria das linhas do cartão usa a mesma lista de categorias das linhas da conta.
7. Estorno do cartão aparece em verde.

## 10. Fora do escopo

Paginação de Transações, outros bancos e cartões, mudanças na tela Cartão, mudanças no seletor de mês, investimentos (Fase 5).
