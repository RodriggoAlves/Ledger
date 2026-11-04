ALTER TYPE "public"."tx_type" ADD VALUE 'ESTORNO';--> statement-breakpoint
ALTER TABLE "category_rules" ADD COLUMN "tipo" "tx_type";--> statement-breakpoint
-- Regras existentes herdam o tipo da sua categoria.
UPDATE "category_rules" r SET "tipo" = c."tipo" FROM "categories" c WHERE c."id" = r."category_id";--> statement-breakpoint
ALTER TABLE "category_rules" ALTER COLUMN "tipo" SET NOT NULL;
