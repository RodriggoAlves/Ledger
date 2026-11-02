# Fase 3 — Importação da fatura do cartão PicPay — Especificação de Design

Data: 2026-11-01
Status: aprovado em conversa, aguardando revisão da spec
Spec base: `docs/superpowers/specs/geral/2026-11-01-financas-design.md` (esta fase substitui partes da seção 5)

## 1. Contexto e objetivo

O extrato CSV do PicPay só traz o que mexe no saldo e no cofrinho (Pix, débito, cofrinho, pagamento de fatura). As compras no **crédito** só aparecem na **fatura em PDF**. A Fase 2 tentou cobrir o crédito com "Passar para o crédito" e lançamento manual; na prática nenhuma linha do extrato é compra no crédito, e digitar parcelas à mão é propenso a erro.

**Objetivo:** importar a fatura PDF do PicPay todo mês, no fechamento, e com isso:
- registrar todas as compras do crédito, já categorizadas;
- reconhecer a mesma compra parcelada entre meses (`PARC08/10` → `PARC09/10`);
- projetar as faturas seguintes a partir das parcelas restantes;
- marcar a fatura anterior como paga quando a seguinte traz o pagamento.

**Critérios de sucesso**
- Importar a fatura de setembro/2026 (`PicPay_Fatura_092026.pdf`) gera as compras corretas, total conferido com o PDF.
- Importar a fatura seguinte confirma as parcelas projetadas, sem duplicar compras, e marca setembro como paga.
- O dashboard deixa de contar o pagamento da fatura como gasto e passa a contar as compras do cartão.

**Restrições do usuário**
- Sem IA: leitura por código determinístico (extração de texto + expressões regulares).
- O usuário importa **sempre no fechamento**; o app mostra só faturas importadas + parcelas projetadas (sem lançamento manual de compras recentes).
- Agora só PicPay. Mercado Pago e Nubank virão depois, cada um com seu importador (ciclo próprio de spec/plano).

## 2. O que sai do app

- "Passar para o crédito" (diálogo, actions, `convertTransaction`, `undoConversion`) e a coluna `transactions.convertida_credito`.
- Lançamento manual de compra no cartão (`/cartao/nova`, `purchase-form`, `createPurchase`, `purchase-input`).
- Formulário de configuração do cartão (`card-form`): o cartão é criado/atualizado a partir do PDF.
- A pergunta "Quantas parcelas já foram pagas?".
- Dados de crédito existentes (cartão, faturas, compras, parcelas) são **apagados na migração**; a primeira fatura importada traz tudo de novo.

## 3. Formato da fatura PicPay (referência: fatura 09/2026)

- **Cabeçalho** (repete em toda página): `Vencimento: 05/10/2026 | Fechamento: 29/09/2026`.
- **Blocos por cartão**: título `Picpay Card` (titular) ou `Picpay Card final 9109` (virtuais/adicionais), seguido de `Transações Nacionais`, cabeçalho `Data Estabelecimento Valor (R$)` e linhas `DD/MM DESCRIÇÃO VALOR`.
- **Parcelas**: sufixo colado na descrição, `PARCkk/nn` (ex.: `AMAZON BR PARC08/10`, `MERCADOLIVRE*MPARC04/10`). A data da linha é a **data da compra original**.
- **Negativos**: `PAGAMENTO DE FATURA -1.661,55`; créditos/estornos (`CREDITO PULA COMPRA -3.199,00`, `AMAZONMKTPLC*SAMSUNGEL -3.199,00`).
- **Total**: `Total geral dos lançamentos 6.405,25` = **soma das linhas positivas** de todos os cartões. Os "Subtotal dos lançamentos" por cartão não são confiáveis (o bloco `Picpay Card` mostra 23,99 tendo 23,99 + 35,99) e são ignorados.
- Layout em duas colunas por página; listas continuam de uma página para a outra. Páginas 1, 5 e 6 (resumo, juros, avisos) não têm lançamentos.

## 4. Leitura do PDF

1. **Extração de texto** (`src/lib/pdf-text.ts`, biblioteca `unpdf`): para cada página, os itens de texto são separados em coluna esquerda/direita pela metade da largura da página e agrupados em linhas pela coordenada vertical. Saída: texto com uma linha por linha visual, na ordem página → coluna esquerda → coluna direita, de cima para baixo.
2. **Parser puro** (`src/domain/picpay-invoice-parser.ts`) recebe esse texto:
   - fechamento e vencimento pelo cabeçalho; ausentes → erro "Arquivo não parece ser uma fatura do PicPay";
   - considera só o trecho entre o primeiro `Transações Nacionais` e `Total geral dos lançamentos`;
   - `Picpay Card` / `Picpay Card final NNNN` define o cartão (final) das linhas seguintes (`null` para o titular);
   - linha de lançamento: `^DD/MM DESCRIÇÃO VALOR$`, valor no formato `-1.234,56`;
   - `PARCkk/nn` no fim da descrição → parcela `kk` de `nn`; a descrição da compra é o texto sem o sufixo;
   - linhas que não casam são ignoradas.
3. **Conferência**: soma das linhas positivas ≠ "Total geral dos lançamentos" → erro "A fatura não foi lida corretamente (diferença de R$ X)". Nada é salvo.

**Ano da data**: a linha só traz `DD/MM`. Ano = o mais recente que deixa a data **≤ fechamento** e, para parcela `kk`, com pelo menos `kk−1` meses entre a compra e o fechamento. Ex.: fechamento 29/09/2026 → `21/02 PARC08/10` = 21/02/2026; `15/12` numa fatura que fecha em 29/01/2027 = 15/12/2026.

**Mês da fatura (`mes`)**: mês do fechamento (`AAAA-MM`), como na Fase 2. Fatura 09/2026 → `mes = 2026-09`. A tela mostra também "Vence em 05/10/2026".

## 5. Classificação das linhas

| Linha | Regra | Vira |
|---|---|---|
| Pagamento | descrição normalizada = `PAGAMENTO DE FATURA` | marca a fatura `mes − 1` do cartão como **paga** (data = data da linha). Não é compra |
| Estorno/crédito | valor negativo, não pagamento | compra `ESTORNO` 1x, valor negativo, abate a categoria |
| Compra à vista | valor positivo, sem `PARC` | compra 1x nesta fatura |
| Parcela | valor positivo, com `PARCkk/nn` | compra de `nn` parcelas (ver seção 6) |

**Categoria**: mesmas regras de `category_rules` usadas no CSV (`matchCategory` sobre a descrição sem `PARC`). Sem regra → sem categoria.

**Par compra/estorno**: na mesma fatura, uma linha negativa com mesma descrição e mesmo valor absoluto de uma positiva forma um par; o detalhe exibe os dois riscados. Só visual: os valores continuam somando (e se anulam).

## 6. Mesma compra entre meses

**Chave da compra**: `descrição normalizada sem PARC | data da compra (AAAA-MM-DD) | nn | valor da parcela (centavos, com sinal: estorno ≠ compra) | ocorrência`. A ocorrência (0, 1, …) diferencia linhas idênticas na mesma fatura, contadas na ordem do PDF. Chave única por cartão.

Ao importar a fatura `M`:
- **Parcela `kk/nn`, chave nova** → cria a compra com `parcela_inicial = kk`; cria as parcelas `kk..nn`: a `kk` **confirmada** em `M`, as seguintes **projetadas** em `M+1, M+2…`. As parcelas `1..kk−1` são "anteriores ao app": não existem como linhas e não contam em nada.
- **Parcela `kk/nn`, chave existente** → confirma a parcela `kk` dessa compra. Se ela estava projetada em outro mês, passa para `M` e as seguintes não confirmadas são reprojetadas a partir dela.
- **Compra 1x / estorno** → cria compra com 1 parcela confirmada em `M`. Chave já existente → linha ignorada (já importada).
- **Projeção que não veio**: parcela projetada em `M` sem linha correspondente → listada na prévia ("AMAZON BR 9/10 era esperada e não veio"); ao confirmar, ela e as seguintes da mesma compra são **canceladas** (não contam, ficam guardadas para desfazer).

**Faturas projetadas** são criadas sob demanda para receber parcelas futuras, com datas calculadas pelos dias de fechamento/vencimento do cartão (regra da seção 5 da spec base).

## 7. Modelo de dados (mudanças)

```
credit_cards       + banco ('PICPAY'); único (user_id, banco) no lugar de único (user_id).
                   dia_fechamento/dia_vencimento atualizados a cada fatura importada.
invoice_imports    NOVA: id, user_id, card_id, invoice_id, nome_arquivo, criado_em,
                   total_lancamentos (centavos), linhas
invoices           + import_id? (fatura importada; null = projetada)
                   + paga_por_import_id? (pagamento veio de qual importação)
credit_purchases   − transaction_id
                   + tipo ('COMPRA' | 'ESTORNO'), chave (único por card_id),
                     parcela_inicial, cartao_final?, import_id (importação que criou)
                   valor_total = valor da parcela × parcelas (negativo no estorno)
installments       − paga
                   + confirmada_por_import_id?, cancelada_por_import_id?
transactions       − convertida_credito
```

**Status da fatura** (derivado): `paga = true` → **Paga**; `import_id` preenchido → **Fechada**; senão → **Projetada**.

Toda tabela nova tem RLS habilitado. A migração apaga os dados de `installments`, `credit_purchases`, `invoices` e `credit_cards` antes de alterar as colunas.

## 8. Fluxo de importação e telas

**Cartão → "Importar fatura (PDF)"**
1. Upload do PDF (máx. 5 MB). O servidor extrai, lê, confere o total e monta o plano.
2. **Prévia**: mês da fatura e vencimento, total conferido, compras novas, parcelas confirmadas, projeções que não vieram, pagamento detectado ("marca a fatura de ago/2026 como paga"), linhas sem categoria.
3. **Confirmar** → o servidor refaz a leitura do mesmo arquivo (não confia na prévia) e grava tudo em uma transação do banco.

**Lista de faturas**: mês, "Vence em …", status (Paga / Fechada / Projetada), total. Total da fatura = soma das parcelas não canceladas.

**Detalhe da fatura**: data da compra, descrição, etiqueta `8/10` nas parcelas, final do cartão em texto pequeno, categoria editável (com a mesma oferta "Aplicar '<descrição>' → <categoria> nas próximas?" das transações), pares compra/estorno riscados. Botão "Marcar como paga" continua existindo para a fatura fechada mais recente.

**Histórico de importações de fatura** (na tela Cartão): arquivo, mês, data da importação, botão "Excluir".

**Dashboard**: cada parcela não cancelada conta como gasto no `mes` da sua fatura, na categoria da compra; estornos abatem. Compras no débito do extrato continuam contando no dia.

## 9. Extrato CSV (ajustes)

- `Pagamento realizado` com destino começando em `Fatura` → **MOVIMENTACAO** (não conta como gasto; o gasto real são as compras da fatura).
- `forma de pagamento = Com cartão` → etiqueta **Débito** na lista de transações.
- Cor do valor na lista **pelo tipo**: gasto vermelho, receita verde, movimentação cinza-azulado (`#94a3b8`), via token `--transfer` claro/escuro.
- Transações já importadas não são reclassificadas automaticamente; o usuário pode mudar o tipo na lista (já existe) ou excluir e reimportar o CSV.

## 10. Erros e casos especiais

| Situação | Comportamento |
|---|---|
| Não é PDF / PDF sem texto (escaneado) / sem cabeçalho de fatura | "Arquivo não parece ser uma fatura do PicPay". Nada salvo |
| PDF com senha | "Remova a senha do PDF antes de importar". Nada salvo |
| Arquivo > 5 MB | "Arquivo muito grande (máx. 5 MB)" |
| Soma ≠ total geral | "A fatura não foi lida corretamente (diferença de R$ X)". Nada salvo |
| Fatura do mesmo mês já importada | "A fatura de <mês> já foi importada". Nada salvo |
| Fatura mais antiga que a última importada | "Importe as faturas em ordem: a de <mês> já foi importada". Nada salvo |
| Duas linhas idênticas | Duas compras (ocorrência na chave) |
| Excluir importação de fatura | Só a **mais recente** do cartão (senão: "Exclua primeiro a fatura de <mês mais novo>"). Em uma transação: apaga as compras criadas por ela (parcelas em cascata), desconfirma as parcelas que ela confirmou, desfaz os cancelamentos que ela fez, desmarca a fatura que ela marcou como paga, volta a fatura a "Projetada" e apaga o registro. Faturas projetadas que ficarem vazias são apagadas |

## 11. Testes

- Fixture: texto extraído da fatura 09/2026, **sem nome e endereço** (`tests/fixtures/picpay-fatura-092026.txt`). PDFs reais nunca são commitados (`*.pdf` no `.gitignore`).
- Parser: cabeçalho, cartões e finais, `PARC`, negativos, total 6.405,25 conferido, arquivo inválido, diferença de total.
- Ano da data: virada de ano, parcela antiga, data no dia do fechamento.
- Plano de importação (puro): compra nova parcelada, confirmação, reprojeção, projeção que não veio, 1x repetida, pagamento, ocorrências.
- Banco: aplicar plano, reimportar mesma fatura recusado, importar mês seguinte confirma e marca pago, excluir importação restaura o estado, dados de outro usuário intocados.
- CSV: `Pagamento realizado` / `Fatura PicPay Card` → MOVIMENTACAO.

## 12. Fora do escopo

Outros bancos (Mercado Pago, Nubank: próximas fases, um importador por banco), lançamento manual de compras no crédito, juros/rotativo/parcelamento de fatura, limite, compras internacionais, reclassificação automática de transações já importadas.
