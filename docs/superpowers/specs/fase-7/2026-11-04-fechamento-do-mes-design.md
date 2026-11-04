# Fechamento do mês — Especificação de Design

Data: 2026-11-04
Status: aprovado em conversa, aguardando revisão da spec
Specs relacionadas: `docs/superpowers/specs/fase-6/2026-11-03-estornos-e-transferencias-design.md` (tipos, estornos, regras com sentido) e `docs/superpowers/specs/fase-5/2026-11-03-fase-5-relatorios-e-investimentos-design.md` (relatórios)

## 1. Contexto e objetivo

As entradas nunca batem porque o salário cai no **Sicoob** e chega ao PicPay como Pix de "RODRIGGO ALVES AREBA". Esse Pix nem sempre é o salário, por três motivos:

- **Mês errado.** Em 31/jan chegaram R$ 3.000 + R$ 2.000, o que deixou fevereiro com R$ 163.
- **Picado.** Setembro veio em R$ 1.800 + R$ 2.219.
- **Misturado.** Há Pix pequenos de mim para mim ao longo do mês.

O Sicoob é só passagem (o salário cai e vai para o PicPay), então tudo o que importa passa pelo extrato do PicPay. Open Finance está **fora**, por decisão do usuário: os dados vêm só do extrato e da fatura do PicPay.

**Modelo do usuário:** o app é o **histórico de todas as transações**, como vieram do banco. O usuário **classifica** essas transações, e Dashboard e Relatórios são construídos a partir da classificação. Nada é digitado à parte. O salário é o Pix que o usuário aponta como salário.

**Objetivo:**

1. Pix entre contas próprias não inflam as Entradas no dia a dia.
2. Um **fechamento mensal** guiado deixa cada mês classificado e conferido.
3. **Relatórios mostram só meses fechados.**
4. O Dashboard continua ao vivo.

**Critérios de sucesso**

- Com o nome no extrato configurado, um Pix recebido ou enviado com esse nome chega na importação como **Movimentação · Transferência própria**.
- Em `/fechamento?mes=2026-09`, os dois Pix de setembro (R$ 1.800 e R$ 2.219,52) podem ser marcados como Salário. As Entradas de setembro somam R$ 4.019,52.
- Depois de fechar setembro, os Relatórios incluem setembro. Um mês ainda aberto fica fora dos totais, gráficos e CSV, com aviso e link para fechar.
- Uma importação que acrescenta ou muda um lançamento num mês fechado faz o selo virar **"Alterado depois do fechamento"**. O mês continua nos Relatórios.
- Fechar ou reabrir um mês não altera nenhuma transação.

## 2. Decisões

1. **Nada do que existe sai.** Importação, regras, categorias e Transações continuam iguais. O módulo só acrescenta.
2. **Nome no extrato (titular).** Configuração por usuário, texto livre. Casamento por igualdade após `normalize` (sem acento, maiúsculas, `trim`). Não é "contém", para não pegar descrições como "No cofrinho…".
3. **Importação:** uma linha cujo `tipo` do parser é `GASTO` ou `RECEITA` e cuja descrição é igual ao titular vira `MOVIMENTACAO` na categoria "Transferência própria". Isso vale **antes** das regras.
   - Se a categoria não existir, a linha fica sem categoria.
   - Linhas `MOVIMENTACAO`/`ESTORNO` do parser não mudam.
   - Configurar o nome **não** altera o histórico: os meses antigos são tratados no fechamento.
4. **Salário = transação classificada.** É um Pix (ou vários) marcado como Receita numa categoria de receita. Não existe lançamento manual de renda.
5. **Fechamento = selo, não trava.** O mês continua editável e importável. O selo guarda uma **assinatura** dos lançamentos do mês. Se ela mudar, o mês fica "Alterado depois do fechamento".
6. **Relatórios usam só meses fechados**, incluindo os alterados depois do fechamento.
7. **O Dashboard é ao vivo** e não depende de fechamento.
8. **Categoria basta.** Sem renomear nem anotar transações nesta fase.

## 3. Dados

**Tabela `user_settings`**

| Coluna | Tipo |
|---|---|
| `user_id` | uuid, PK |
| `nome_extrato` | text, null |

Tem RLS ativado, como as demais.

**Tabela `month_closings`**

| Coluna | Tipo |
|---|---|
| `id` | uuid, PK |
| `user_id` | uuid, NOT NULL |
| `mes` | text "AAAA-MM", NOT NULL |
| `fechado_em` | timestamptz, NOT NULL, default now |
| `assinatura` | text, NOT NULL |

Unique `(user_id, mes)`. Tem RLS ativado.

**Assinatura** (`src/domain/closing.ts`, `entriesSignature(entries: MonthEntry[]): string`):

- É o sha256 das linhas `id|valor|tipo|categoryId` dos lançamentos do mês (`getMonthEntries`: extrato + parcelas da fatura), ordenadas por `id`.
- Detecta importação nova, exclusão de importação, troca de tipo ou categoria e parcela nova da fatura.

**Status do mês** (`monthStatus(closing | null, entries)`): `"ABERTO"`, `"FECHADO"` ou `"ALTERADO"`.

## 4. Configurações

Uma seção nova **"Seu nome no extrato"**, com um campo e o botão salvar. A ajuda diz:

> Pix enviados ou recebidos com exatamente este nome são transferências entre suas contas.

Salvar não mexe em transações.

## 5. Tela de fechamento (`/fechamento?mes=AAAA-MM`)

- O mês padrão é o mês anterior ao atual.
- Há um seletor de mês, como nas outras telas.
- O cabeçalho diz "Fechamento de outubro" e mostra o status: Aberto, Fechado em 05/11 ou Alterado depois do fechamento.
- Os passos ficam numa página só, em ordem. Cada passo mostra o que falta ou "Tudo certo".
- **Nenhum passo bloqueia** o fechamento.
- A página não entra no menu (que já tem 5 itens).

### Passo 1 — Importações

Informativo:

- data do último lançamento do extrato dentro do mês;
- status da fatura que fecha no mês (importada, projetada ou inexistente);
- link para Importar e Cartão.

### Passo 2 — Pix entre suas contas e renda

- Sem nome configurado: um campo para informá-lo ali mesmo. Salva em `user_settings`.
- Com nome: lista **todos** os lançamentos do mês com essa descrição, nos dois sentidos, seja qual for a classificação atual.
- Cada linha tem um seletor **"O que foi?"**. As opções são **Transferência própria** e cada categoria de receita do usuário (Salário, Adiantamento de férias, …).
  - Escolher "Transferência própria" grava `MOVIMENTACAO` + categoria "Transferência própria".
  - Escolher uma categoria de receita grava `RECEITA` + essa categoria.
  - Lançamentos enviados (valor < 0) só oferecem "Transferência própria" e "Gasto" (mantém o tipo `GASTO` sem categoria). Assim um Pix que de fato foi gasto não é forçado a virar transferência.
  - **Sem oferta de regra** neste passo, porque uma regra "RODRIGGO → Salário" estragaria as próximas importações.
- O rodapé mostra "Renda do mês: R$ X", a soma das receitas do mês (de qualquer origem, incluindo o ticket).

### Passo 3 — Entradas sem categoria

- São os lançamentos com valor > 0, sem categoria, que não são do titular e não são `MOVIMENTACAO`.
- Usam a mesma linha de Transações (tipo + categoria, com oferta de regra).

### Passo 4 — Gastos sem categoria

- São `GASTO`/`ESTORNO` sem categoria, da conta e do cartão.
- Usam as mesmas linhas de Transações (a do cartão edita a compra).

### Passo 5 — Resumo e fechar

- Entradas, Gastos e Saldo do mês, com os mesmos números do Dashboard.
- Pendências restantes: contagem dos passos 2–4 que ainda têm itens. No passo 2, "pendência" é um Pix recebido do titular que ainda é `RECEITA` sem categoria.
- Botões:
  - **Fechar mês**, que vira **"Fechar mesmo assim"** quando há pendências;
  - **Refechar**, quando o status é "Alterado";
  - **Reabrir**, que apaga o fechamento.
- Fechar grava ou atualiza `month_closings` com a assinatura calculada **no servidor**.

## 6. Dashboard (ao vivo)

- **Mês anterior não fechado:** card "Outubro ainda não foi fechado", com o botão **Fechar mês**.
  - Aparece só quando o mês exibido é o atual e o mês anterior tem lançamentos e não tem fechamento.
- **Renda não identificada:**
  - **Quando aparece:** no mês exibido há Pix recebidos do titular e nenhum lançamento do titular é `RECEITA`.
  - **Texto:** aviso "Você recebeu R$ X de você mesmo em outubro e nada foi marcado como renda. Algum foi salário?"
  - **Link:** leva ao passo 2 do fechamento daquele mês.
  - Sem titular configurado, o aviso não aparece.

## 7. Relatórios só com meses fechados

- `loadPeriod` passa a devolver **só os meses do período com fechamento** (FECHADO ou ALTERADO), mais o status de cada mês do período.
- Todas as abas que usam `loadPeriod` passam a usar só esses meses: Visão geral, Categorias, Lançamentos, o gráfico mensal do Cartão e o CSV.
  - Médias e "último mês" passam a ser sobre os meses fechados.
- **Não mudam:**
  - "Comprometido nas próximas faturas" (futuro);
  - a aba Investimentos (saldos dos cofrinhos).
- **Aviso no topo da página:**
  - "Fora dos relatórios (ainda abertos): setembro, outubro", com link para o fechamento de cada mês;
  - "⚠ Alterado depois do fechamento: agosto", com link para refechar.
- Sem nenhum mês fechado no período: estado vazio "Nenhum mês fechado neste período", com link para o fechamento do mês anterior.

## 8. Fora de escopo

- Open Finance (decisão do usuário).
- Importar o Sicoob.
- Lançamento manual de renda.
- Renomear ou anotar transações.
- Bot de mensagens.
- Travar meses fechados.
- Converter o histórico automaticamente ao configurar o nome.

## 9. Testes

Vitest, funções de domínio:

- `closing.ts`:
  - `entriesSignature` é estável na ordem e muda com valor, tipo, categoria, inclusão e remoção;
  - `monthStatus` devolve os três estados.
- `import-plan`:
  - o titular vira `MOVIMENTACAO` + Transferência própria nos dois sentidos, antes das regras;
  - o casamento é por igualdade normalizada (acento e caixa) e não por "contém";
  - linhas `MOVIMENTACAO`/`ESTORNO` do parser não mudam;
  - sem titular, nada muda.
- Funções puras do fechamento:
  - quais lançamentos são do titular;
  - quais entradas e gastos estão pendentes;
  - contagem de pendências.
- Aviso de renda não identificada no Dashboard: quando aparece e quando não.
- Filtro de meses fechados nos Relatórios: `closedPeriod(periodo, status)` mantém FECHADO e ALTERADO e lista os abertos.
