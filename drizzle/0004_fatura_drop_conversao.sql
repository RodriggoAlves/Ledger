-- Fase 3: dados de crédito da Fase 2 são descartados; a primeira fatura importada traz tudo de novo.
DELETE FROM "installments";--> statement-breakpoint
DELETE FROM "credit_purchases";--> statement-breakpoint
DELETE FROM "invoices";--> statement-breakpoint
DELETE FROM "credit_cards";--> statement-breakpoint
ALTER TABLE "credit_purchases" DROP CONSTRAINT "credit_purchases_transaction_id_unique";--> statement-breakpoint
ALTER TABLE "credit_purchases" DROP CONSTRAINT "credit_purchases_transaction_id_transactions_id_fk";
--> statement-breakpoint
ALTER TABLE "credit_purchases" DROP COLUMN "transaction_id";--> statement-breakpoint
ALTER TABLE "installments" DROP COLUMN "paga";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "convertida_credito";