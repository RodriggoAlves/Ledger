-- "Transferência própria" deixa de ser receita: dinheiro entre contas próprias não é entrada nem gasto.
UPDATE "categories" SET "tipo" = 'MOVIMENTACAO' WHERE "nome" = 'Transferência própria' AND "tipo" = 'RECEITA';--> statement-breakpoint
UPDATE "transactions" t SET "tipo" = 'MOVIMENTACAO' FROM "categories" c
WHERE t."category_id" = c."id" AND c."nome" = 'Transferência própria' AND t."tipo" = 'RECEITA';--> statement-breakpoint
UPDATE "category_rules" r SET "tipo" = 'MOVIMENTACAO' FROM "categories" c
WHERE r."category_id" = c."id" AND c."nome" = 'Transferência própria';--> statement-breakpoint
-- Compra estornada e Pix devolvido são estornos; categoria de receita não serve para estorno.
UPDATE "transactions" SET "category_id" = NULL
WHERE "tipo_original" IN ('Compra estornada', 'Pix devolvido') AND "tipo" = 'RECEITA'
  AND "category_id" IN (SELECT "id" FROM "categories" WHERE "tipo" <> 'GASTO');--> statement-breakpoint
UPDATE "transactions" SET "tipo" = 'ESTORNO'
WHERE "tipo_original" IN ('Compra estornada', 'Pix devolvido') AND "tipo" = 'RECEITA';
