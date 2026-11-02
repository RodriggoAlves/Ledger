# Categorias de receita — Especificação de Design

Data: 2026-11-02
Status: aprovado em conversa, aguardando revisão da spec
Specs relacionadas: `docs/superpowers/specs/geral/2026-11-01-financas-design.md` (categorias e regras) e `docs/superpowers/specs/fase-4/2026-11-02-fase-4-cartao-no-dashboard-e-transacoes-design.md`

## 1. Contexto e objetivo

Hoje toda entrada (tipo Receita) sem regra é gravada na importação com a categoria genérica "Receitas" (`getFallbackCategories` + `buildImportPlan`). Em out/2026, as 15 entradas estão todas em "Receitas", o que não diz de onde veio o dinheiro.

**Objetivo:** o tipo continua **Receita**, mas a categoria passa a ser específica (ex.: "Salário"). Não existe mais categoria padrão aplicada automaticamente às receitas.

**Critérios de sucesso**
- Importar um extrato: entrada sem regra chega **Sem categoria**; entrada com regra recebe a categoria da regra.
- O usuário tem as categorias de receita Salário, Freelance / Serviços, Reembolsos, Transferência própria e Outras receitas.
- A categoria "Receitas" deixa de existir; as entradas que estavam nela ficam Sem categoria.
- Em Transações, o seletor de categoria de uma linha Receita mostra só categorias de receita (e "Sem categoria").

## 2. Regras decididas

1. **Tipo e categoria são coisas separadas.** O parser continua classificando "Pix recebido" como Receita; nada muda no tipo.
2. **Receita sem regra fica Sem categoria**, como já acontece com Gasto. Ao escolher uma categoria em Transações, a oferta de criar regra que já existe aparece.
3. **Movimentação não muda:** sem regra, continua indo para a categoria "Movimentação".
4. **Categorias de receita padrão** (tipo `RECEITA`): Salário, Freelance / Serviços, Reembolsos, Transferência própria, Outras receitas.
5. **Dados atuais:** a categoria "Receitas" é apagada; as transações dela ficam Sem categoria (`on delete set null`) e as regras que apontavam para ela são apagadas (`on delete cascade`).
6. **Seletor filtrado pelo tipo da linha:** linha Gasto mostra categorias de gasto; linha Receita, categorias de receita; linha Movimentação, categorias de movimentação. "Sem categoria" sempre aparece. Se a categoria atual da linha for de outro tipo (ex.: o tipo foi trocado), ela continua aparecendo na lista até ser trocada, para o seletor não ficar vazio.

## 3. Categorias padrão (usuários novos)

`DEFAULT_CATEGORIES` em `src/domain/defaults.ts`: sai `Receitas`; entram, todas com `tipo: "RECEITA"`:

| Nome | Cor |
|---|---|
| Salário | `#16a34a` |
| Freelance / Serviços | `#0d9488` |
| Reembolsos | `#65a30d` |
| Transferência própria | `#059669` |
| Outras receitas | `#4d7c0f` |

As cores não entram no gráfico de gastos (só Gasto entra lá); servem para diferenciar nas telas de Configurações.

## 4. Importação

- `getFallbackCategories` (`src/db/queries.ts`) passa a devolver só `{ MOVIMENTACAO }`.
- `buildImportPlan` (`src/domain/import-plan.ts`): categoria = regra que casa; senão, `MOVIMENTACAO` usa a categoria de Movimentação e os demais tipos (Gasto e Receita) ficam `null`.
- O contador "sem categoria" da prévia passa a incluir as receitas sem regra.

## 5. Transações

- `getCategories` já devolve o `tipo` de cada categoria; a página passa `{ id, nome, tipo }` para as linhas.
- Uma função pura `categoriesForType(categories, tipo, atualId)` devolve as categorias do tipo, mais a atual quando for de outro tipo, mantendo a ordem por nome.
- Linha da conta: usa `categoriesForType(categories, row.tipo, row.categoryId)`.
- Linha do cartão (sempre Gasto): usa `categoriesForType(categories, "GASTO", row.categoryId)`. A tela do detalhe da fatura usa o mesmo filtro.

## 6. Migração dos dados atuais

Nova migração SQL `drizzle/0006_categorias_receita.sql` (registrada no `_journal.json`), sem mudança de schema:

1. Para cada usuário com ao menos uma categoria, inserir as cinco categorias de receita (`on conflict (user_id, nome) do nothing`).
2. Apagar as categorias com `nome = 'Receitas'` e `tipo = 'RECEITA'`.

Usuários novos recebem a lista nova por `ensureUserDefaults`.

## 7. Impactos

| Área | Impacto |
|---|---|
| Entradas já importadas | Todas ficam Sem categoria; o usuário recategoriza aos poucos, criando regras. |
| Dashboard | Nenhum: Entradas soma por tipo, não por categoria. |
| Configurações | Lista mostra as cinco categorias novas no lugar de "Receitas". |
| Regras | Regras que apontavam para "Receitas" somem junto com ela. |

## 8. Testes

- `buildImportPlan`: receita sem regra → `null`; receita com regra → categoria da regra; movimentação sem regra → categoria de Movimentação; `semCategoria` conta a receita.
- `DEFAULT_CATEGORIES`: não tem "Receitas"; tem as cinco de receita com tipo `RECEITA`; nomes únicos.
- `categoriesForType`: filtra pelo tipo; inclui a atual de outro tipo; sem atual não inclui nada extra; mantém a ordem.
- Migração: conferida contra o banco de teste (`TEST_DATABASE_URL`) quando disponível; senão, pelo usuário após aplicar.

## 9. Fora do escopo

Gráfico ou resumo de entradas por categoria no Dashboard, regras automáticas novas para entradas, mudanças em Movimentação.
