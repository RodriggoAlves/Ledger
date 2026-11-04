CREATE TABLE "month_closings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mes" text NOT NULL,
	"fechado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"assinatura" text NOT NULL,
	CONSTRAINT "month_closings_user_id_mes_unique" UNIQUE("user_id","mes")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"nome_extrato" text
);
