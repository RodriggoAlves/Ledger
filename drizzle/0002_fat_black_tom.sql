CREATE TABLE "credit_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"dia_fechamento" integer NOT NULL,
	"dia_vencimento" integer NOT NULL,
	CONSTRAINT "credit_cards_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "credit_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"category_id" uuid,
	"valor_total" integer NOT NULL,
	"parcelas" integer NOT NULL,
	"data_compra" timestamp NOT NULL,
	"transaction_id" uuid,
	CONSTRAINT "credit_purchases_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"valor" integer NOT NULL,
	"paga" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"mes" text NOT NULL,
	"fechamento" timestamp NOT NULL,
	"vencimento" timestamp NOT NULL,
	"paga" boolean DEFAULT false NOT NULL,
	"paga_em" timestamp with time zone,
	CONSTRAINT "invoices_card_id_mes_unique" UNIQUE("card_id","mes")
);
--> statement-breakpoint
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_card_id_credit_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."credit_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_purchase_id_credit_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."credit_purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_card_id_credit_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."credit_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_purchases_user_id_index" ON "credit_purchases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "installments_user_id_index" ON "installments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "installments_invoice_id_index" ON "installments" USING btree ("invoice_id");