-- Troca a categoria genérica "Receitas" por categorias de receita específicas.
-- Cada usuário que já tem categorias ganha as cinco novas (sem duplicar nomes que já existam).
INSERT INTO "categories" ("user_id", "nome", "cor", "tipo")
SELECT u."user_id", c.nome, c.cor, 'RECEITA'::"tx_type"
FROM (SELECT DISTINCT "user_id" FROM "categories") u
CROSS JOIN (VALUES
  ('Salário', '#16a34a'),
  ('Freelance / Serviços', '#0d9488'),
  ('Reembolsos', '#65a30d'),
  ('Transferência própria', '#059669'),
  ('Outras receitas', '#4d7c0f')
) AS c(nome, cor)
ON CONFLICT ("user_id", "nome") DO NOTHING;--> statement-breakpoint
-- Transações e compras dela ficam sem categoria (on delete set null); regras dela são apagadas (cascade).
DELETE FROM "categories" WHERE "nome" = 'Receitas' AND "tipo" = 'RECEITA';
