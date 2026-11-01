import { and, eq, inArray } from "drizzle-orm";
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from "@/domain/defaults";
import type { Db } from "./client";
import { categories, categoryRules } from "./schema";

/** Cria categorias e regras padrão do usuário. Idempotente. */
export async function ensureUserDefaults(db: Db, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(categories)
      .values(DEFAULT_CATEGORIES.map((c) => ({ ...c, userId })))
      .onConflictDoNothing();

    const [existingRule] = await tx
      .select({ id: categoryRules.id })
      .from(categoryRules)
      .where(eq(categoryRules.userId, userId))
      .limit(1);
    if (existingRule) return;

    const cats = await tx
      .select({ id: categories.id, nome: categories.nome })
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          inArray(
            categories.nome,
            DEFAULT_RULES.map((r) => r.categoria),
          ),
        ),
      );
    const idByName = new Map(cats.map((c) => [c.nome, c.id]));
    const rules = DEFAULT_RULES.filter((r) => idByName.has(r.categoria)).map((r) => ({
      userId,
      padrao: r.padrao,
      categoryId: idByName.get(r.categoria)!,
    }));
    if (rules.length) await tx.insert(categoryRules).values(rules);
  });
}
