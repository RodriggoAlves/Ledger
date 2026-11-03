CREATE TABLE "cdi_overrides" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"taxa_anual" integer NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdi_rates" (
	"data" text PRIMARY KEY NOT NULL,
	"taxa_anual" integer NOT NULL,
	"buscado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"investment_id" uuid NOT NULL,
	"data" timestamp NOT NULL,
	"saldo" integer NOT NULL,
	"informado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investment_snapshots_investment_id_data_unique" UNIQUE("investment_id","data")
);
--> statement-breakpoint
CREATE TABLE "investments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"percentual_cdi" integer DEFAULT 10000 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investments_user_id_nome_unique" UNIQUE("user_id","nome")
);
--> statement-breakpoint
ALTER TABLE "investment_snapshots" ADD CONSTRAINT "investment_snapshots_investment_id_investments_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."investments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "investment_snapshots_user_id_index" ON "investment_snapshots" USING btree ("user_id");