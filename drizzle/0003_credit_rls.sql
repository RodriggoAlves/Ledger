-- Mesma política de 0001: bloqueia a API pública do Supabase; o app usa o papel dono.
ALTER TABLE "credit_cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credit_purchases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "installments" ENABLE ROW LEVEL SECURITY;
