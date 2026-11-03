-- Mesma política de 0001 e 0003: bloqueia a API pública do Supabase; o app usa o papel dono.
ALTER TABLE "investments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "investment_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cdi_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cdi_overrides" ENABLE ROW LEVEL SECURITY;
