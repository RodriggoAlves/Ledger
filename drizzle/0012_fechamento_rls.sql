-- Mesma política de 0001 e 0003: bloqueia a API pública do Supabase; o app usa o papel dono.
ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "month_closings" ENABLE ROW LEVEL SECURITY;
