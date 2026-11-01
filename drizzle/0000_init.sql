CREATE TYPE "public"."tx_origin" AS ENUM('CSV', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."tx_type" AS ENUM('GASTO', 'RECEITA', 'MOVIMENTACAO');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"cor" text NOT NULL,
	"tipo" "tx_type" NOT NULL,
	CONSTRAINT "categories_user_id_nome_unique" UNIQUE("user_id","nome")
);
--> statement-breakpoint
CREATE TABLE "category_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"padrao" text NOT NULL,
	"category_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"nome_arquivo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"linhas_total" integer NOT NULL,
	"linhas_novas" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"import_id" uuid,
	"data_hora" timestamp NOT NULL,
	"descricao" text NOT NULL,
	"tipo_original" text NOT NULL,
	"forma_pagamento" text,
	"valor" integer NOT NULL,
	"tipo" "tx_type" NOT NULL,
	"category_id" uuid,
	"origem" "tx_origin" NOT NULL,
	"convertida_credito" boolean DEFAULT false NOT NULL,
	"hash_unico" text NOT NULL,
	CONSTRAINT "transactions_user_id_hash_unico_unique" UNIQUE("user_id","hash_unico")
);
--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_user_id_data_hora_index" ON "transactions" USING btree ("user_id","data_hora");