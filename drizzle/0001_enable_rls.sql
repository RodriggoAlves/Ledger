-- Bloqueia acesso pela API pública do Supabase (anon/authenticated).
-- O app acessa o banco direto pelo servidor com o papel dono, que ignora RLS.
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "category_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;
