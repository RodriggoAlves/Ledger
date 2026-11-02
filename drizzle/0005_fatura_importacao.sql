CREATE TYPE "public"."purchase_type" AS ENUM('COMPRA', 'ESTORNO');--> statement-breakpoint
CREATE TABLE "invoice_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"nome_arquivo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"total_lancamentos" integer NOT NULL,
	"linhas" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_cards" DROP CONSTRAINT "credit_cards_user_id_unique";--> statement-breakpoint
ALTER TABLE "credit_cards" ADD COLUMN "banco" text DEFAULT 'PICPAY' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_purchases" ADD COLUMN "import_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_purchases" ADD COLUMN "tipo" "purchase_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_purchases" ADD COLUMN "chave" text NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_purchases" ADD COLUMN "parcela_inicial" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_purchases" ADD COLUMN "cartao_final" text;--> statement-breakpoint
ALTER TABLE "installments" ADD COLUMN "confirmada_por_import_id" uuid;--> statement-breakpoint
ALTER TABLE "installments" ADD COLUMN "cancelada_por_import_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "paga_por_import_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_imports" ADD CONSTRAINT "invoice_imports_card_id_credit_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."credit_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_imports" ADD CONSTRAINT "invoice_imports_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_import_id_invoice_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."invoice_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_user_id_banco_unique" UNIQUE("user_id","banco");--> statement-breakpoint
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_card_id_chave_unique" UNIQUE("card_id","chave");--> statement-breakpoint
-- Mesma política de 0001: bloqueia a API pública do Supabase; o app usa o papel dono.
ALTER TABLE "invoice_imports" ENABLE ROW LEVEL SECURITY;
