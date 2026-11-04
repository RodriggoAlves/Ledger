import { eq, sql } from "drizzle-orm";
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from "@/domain/defaults";
import type { Db } from "./client";
import { categories, categoryRules } from "./schema";

/**
 * Cria categorias e regras padrão só para usuário sem nenhuma categoria.
 * Idempotente e seguro contra requisições simultâneas (lock por usuário).
 */
export async function ensureUserDefaults(db: Db, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);

    const [existing] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.userId, userId))
      .limit(1);
    if (existing) return;

    const cats = await tx
      .insert(categories)
      .values(DEFAULT_CATEGORIES.map((c) => ({ ...c, userId })))
      .returning({ id: categories.id, nome: categories.nome, tipo: categories.tipo });
    const byName = new Map(cats.map((c) => [c.nome, c]));
    await tx.insert(categoryRules).values(
      DEFAULT_RULES.map((r) => {
        const cat = byName.get(r.categoria)!;
        return { userId, padrao: r.padrao, categoryId: cat.id, tipo: cat.tipo };
      }),
    );
  });
}
