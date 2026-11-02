# Ledger (finanças pessoais) — Especificação de Design

Data: 2026-11-01
Status: aprovado em conversa, aguardando revisão da spec

## 1. Objetivo

Aplicativo web pessoal para organizar as finanças: entender para onde vai o dinheiro, acompanhar faturas futuras do cartão de crédito e projetar rendimentos de investimentos atrelados ao CDI. Prioridade: **simples e direto** para o usuário.

**Critérios de sucesso**
- Importar o extrato mensal do PicPay em poucos cliques e ver os gastos por categoria.
- Saber o valor das próximas faturas do cartão, incluindo compras parceladas.
- Ver quanto os investimentos devem render e comparar com o rendimento real.

**Contexto**
- Usuário único no início (o próprio dono); no futuro, liberar para outros usuários.
- Banco único: PicPay. Compras feitas geralmente no crédito.
- Sem integração direta com bancos (Open Finance/agregadores ficam fora; Google/Samsung Wallet não fornecem transações).

## 2. Stack e arquitetura

| Camada | Escolha |
|---|---|
| App | Next.js (App Router) + TypeScript, Server Actions |
| Hospedagem | Vercel |
| Banco | Supabase Postgres |
| Login | Supabase Auth (e-mail + senha), cadastro público **desativado** |
| Acesso a dados | Drizzle ORM, somente no servidor |
| UI | shadcn/ui + Tailwind, gráficos com Recharts; responsivo; tema claro/escuro |
| Testes | Vitest para a lógica de domínio |

**Regras de arquitetura**
- Todas as consultas rodam no servidor e filtram por `user_id` da sessão. RLS do Supabase não é requisito nesta versão.
- Toda tabela de domínio possui `user_id` (pronto para multiusuário).
- Lógica de domínio em módulos puros e testáveis, sem dependência de banco ou UI:
  - `csv/picpay-parser` — lê o CSV e devolve transações normalizadas.
  - `categorization` — aplica regras a uma descrição.
  - `invoices` — calcula em qual fatura cai cada parcela e divide valores.
  - `investments` — projeção CDI, aportes e IR regressivo.
  - `cdi` — cliente da API do Banco Central com cache.

## 3. Modelo de dados

```
categories          id, user_id, nome, cor, tipo (GASTO | RECEITA | MOVIMENTACAO)
category_rules      id, user_id, padrao (texto, case-insensitive "contém"), category_id
imports             id, user_id, nome_arquivo, criado_em, linhas_total, linhas_novas
transactions        id, user_id, import_id?, data_hora, descricao, tipo_original,
                    valor (centavos, com sinal), tipo (GASTO | RECEITA | MOVIMENTACAO),
                    category_id?, origem (CSV | MANUAL), convertida_credito (bool),
                    hash_unico (único por user)
credit_cards        id, user_id, nome, dia_fechamento (1–31), dia_vencimento (1–31)
card_purchases      id, user_id, card_id, descricao, category_id?, valor_total (centavos),
                    num_parcelas, data_compra, transaction_id? (quando convertida)
installments        id, purchase_id, numero, valor (centavos), fatura_mes (AAAA-MM), paga (bool)
invoices            id, user_id, card_id, mes (AAAA-MM), vencimento, status (ABERTA | PAGA)
investments         id, user_id, nome, saldo_inicial, percentual_cdi, data_inicio
investment_snapshots id, investment_id, mes (AAAA-MM), saldo_real, informado_em
cdi_rates           data, taxa_anual   (cache global, sem user_id)
```

Valores monetários sempre em **centavos (inteiro)**.

## 4. Importação do CSV e categorização (Fase 1)

**Formato PicPay** — colunas: `data, hora, tipo, origem / destino, valor, forma de pagamento`. Arquivo UTF-8 com BOM. Valores como `−R$ 2.013,93` (sinal de menos U+2212 ou hífen; ponto como milhar, vírgula decimal).

**Classificação por coluna "tipo"**
- `Dinheiro guardado`, `Dinheiro resgatado` → MOVIMENTACAO
- `Pix recebido` → RECEITA
- `Pix enviado`, `Compra realizada` → GASTO
- Tipos desconhecidos: pelo sinal do valor (negativo → GASTO, positivo → RECEITA).

MOVIMENTACAO aparece nas listagens mas **não entra** em totais de gastos/receitas.

**Fluxo**
1. Upload do CSV.
2. Parser normaliza as linhas; calcula `hash_unico = hash(data, hora, tipo, descrição, valor)`.
3. Aplica regras de categoria (primeira regra que casa vence; regras mais longas têm prioridade).
4. Prévia: total de linhas, já importadas (ignoradas), sem categoria, não reconhecidas.
5. Usuário confirma → salva em transação única do banco.

**Categorização inteligente**
- Regras iniciais: UBER, 99 (exceto 99 FOOD) → Transporte; IFOOD, 99 FOOD → Alimentação; TIM, VIVO, CLARO → Telefone; GOOGLE, NETFLIX, SPOTIFY → Assinaturas. Categorias iniciais: Alimentação, Transporte, Telefone, Assinaturas, Lazer, Saúde, Moradia, Compras, Outros, Receitas, Movimentação.
- Ao alterar a categoria de uma transação, o app oferece: "Aplicar '<descrição>' → <categoria> nas próximas?". Se aceito, cria a regra (padrão = descrição completa).
- CRUD de categorias e regras em Configurações.

**Erros**
- Cabeçalho diferente do esperado → mensagem "Arquivo não parece ser um extrato do PicPay", nada é salvo.
- Linha inválida → marcada como "não reconhecida" na prévia; demais seguem.

### 4.1 Histórico e exclusão de importações (Fase 2)

Objetivo: desfazer um arquivo importado por engano (mês errado, arquivo errado) e, se quiser, importá-lo de novo.

**Histórico** — na tela Importar, abaixo do upload, lista das importações do usuário, da mais recente para a mais antiga: nome do arquivo, data/hora da importação, transações importadas (`linhas_novas`) e o período coberto (menor e maior `data_hora` das transações daquela importação). Sem importações → a seção não aparece.

**Excluir importação**
1. Botão "Excluir" em cada item abre uma confirmação: "Excluir a importação '<arquivo>'? <N> transações de <período> serão apagadas. Essa ação não pode ser desfeita." Se a importação não tiver transações: "Excluir a importação '<arquivo>'? Ela não tem transações. Essa ação não pode ser desfeita."
2. Confirmado → em uma única transação do banco: apaga todas as `transactions` com aquele `import_id` e o registro em `imports`.
3. Apaga **todas** as transações do arquivo, inclusive as que tiveram categoria ou tipo editados depois. Regras de categoria criadas a partir delas **são mantidas**.
4. Sucesso → toast "Importação excluída: <N> transações apagadas"; dashboard e transações refletem a remoção.

**Reimportação** — como o `hash_unico` das transações apagadas deixa de existir, reimportar o mesmo CSV traz todas as linhas de volta como novas, já categorizadas pelas regras atuais.

**Regras e segurança**
- A exclusão só considera importações do próprio usuário (`user_id` na consulta + RLS). Id inexistente ou de outro usuário → erro "Importação não encontrada", nada é apagado.
- Transações manuais (`origem = MANUAL`) e transações com `import_id` nulo nunca são afetadas.
- Fase 2: se uma transação da importação tiver sido convertida em crédito, a exclusão desfaz a conversão (remove a compra e as parcelas, como em "Desfazer conversão") no mesmo commit do banco. Se alguma dessas parcelas estiver em fatura já marcada como paga, a exclusão é bloqueada com a mensagem "Esta importação tem compras em faturas pagas. Desfaça a conversão delas antes de excluir."

Fora do escopo: excluir transações avulsas, lixeira/desfazer exclusão, editar uma importação.

## 5. Cartão de crédito e faturas (Fase 2)

**Cartão**: nome, dia de fechamento e dia de vencimento, editáveis no app.

**Regra da fatura**
- Compra com dia ≤ dia de fechamento → fatura que fecha naquele mês; caso contrário → fatura do mês seguinte.
- Vencimento: se dia_vencimento > dia_fechamento, vence no mesmo mês do fechamento; senão, no mês seguinte.
- Dias inexistentes no mês (ex.: 31 em fevereiro) usam o último dia do mês.
- Parcela N cai na fatura da 1ª parcela + (N−1) meses.

**Criar compra no crédito**
1. Manual: descrição, categoria, valor total **ou** valor da parcela, nº de parcelas, data da compra.
2. Conversão: em uma transação importada, escolher "Crédito" e informar parcelas. A transação fica com `convertida_credito = true` e sai dos totais da conta; o gasto passa a valer pelas parcelas. Desfazer a conversão remove a compra e as parcelas.

Em ambos os casos o app pergunta **"Quantas parcelas já foram pagas?"** e marca as N primeiras como pagas.

**Divisão**: valor_total / parcelas em centavos; a diferença de arredondamento vai para a 1ª parcela.

**Tela de faturas**: lista por mês (valor, status), detalhe com parcelas, botão "Marcar como paga" (marca a fatura e suas parcelas).

Fora do escopo: juros, rotativo, anuidade, estornos, limite.

## 6. Investimentos e simulador (Fase 4)

**CDI**: API SGS do Banco Central (série 4389, CDI anualizado):
`https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json`
Busca no máximo 1x por dia, cache em `cdi_rates`. Em falha, usa a última taxa salva. Usuário pode sobrescrever manualmente.

**Cálculo**
- `taxa_diaria = (1 + CDI_anual × percentual)^(1/252) − 1`; mês = 21 dias úteis.
- IR regressivo sobre o rendimento: até 180 dias 22,5%; 181–360 20%; 361–720 17,5%; acima 15%. Aportes mensais tratados com prazo próprio no cálculo do IR.

**Investimentos cadastrados**: nome, saldo, % do CDI, data de início. Projeção em 1, 3, 6 e 12 meses (bruto e líquido estimado).

**Fechamento do mês**: usuário informa o saldo real; app mostra rendimento real vs. esperado e a taxa efetiva (% do CDI). Projeções seguintes partem do último saldo real. Vincular "Dinheiro guardado/resgatado" ao investimento é opcional; o saldo real informado prevalece.

**Simulador** (tela própria): valor inicial, aporte mensal, prazo, % do CDI (CDI atual pré-preenchido). Mostra total aportado, saldo final bruto, rendimento e líquido de IR, mais gráfico mês a mês (aportado vs. rendido).

Fora do escopo: ações, FIIs, cripto, Tesouro com marcação a mercado.

## 7. Telas

1. **Login** — e-mail e senha, sem cadastro.
2. **Dashboard** — seletor de mês; gastos por categoria (rosca + lista com valor e %); clique abre as transações da categoria.
3. **Transações** — filtros por mês, categoria e tipo; edição de categoria/tipo; conversão em crédito.
4. **Importar** — upload, prévia, confirmação; histórico de importações com exclusão.
5. **Cartão e faturas** — config do cartão, faturas futuras, detalhe, marcar como paga, compra manual. *(Fase 2)*
6. **Investimentos** — lista, projeções, fechamento do mês. *(Fase 4)*
7. **Simulador** — projetor de rendimentos com aporte mensal. *(Fase 4)*
8. **Configurações** — categorias e regras.

## 8. Fases

- **Fase 1**: setup, login, importação CSV, transações, categorização, dashboard por categoria.
- **Fase 2**: histórico e exclusão de importações (seção 4.1, primeiro plano), cartão, compras parceladas, conversão de transações, faturas.
- **Fase 3**: importação da fatura PDF do PicPay; remove conversão de transações e compra manual. Spec própria: `docs/superpowers/specs/fase-3/2026-11-01-fase-3-fatura-picpay-design.md`.
- **Fase 4**: CDI, investimentos, fechamento mensal, simulador.

O usuário escolhe qual fase implementar; cada fase recebe seu próprio plano de implementação.

## 9. Testes

Testes unitários (Vitest) para todos os módulos de domínio:
- Parser: arquivo de exemplo anonimizado do PicPay, sinais `−`/`-`, milhar, BOM, linhas inválidas.
- Categorização: prioridade de regras, "99" vs "99 FOOD", case-insensitive.
- Exclusão de importação (teste de banco): apaga só as transações daquele `import_id` e o registro da importação; não toca outra importação, transações manuais nem dados de outro usuário; reimportar o mesmo CSV depois traz as linhas de volta como novas.
- Faturas: compra antes/depois do fechamento, virada de ano, dia 31, arredondamento de parcelas.
- Investimentos: projeção com e sem aportes, faixas de IR, fallback de CDI.

## 10. Privacidade

Extratos reais nunca são commitados (`*.csv` no `.gitignore`); fixtures de teste usam dados anonimizados.
