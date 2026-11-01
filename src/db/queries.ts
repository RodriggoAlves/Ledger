import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { Rule } from "@/domain/categorization";
import { db } from "./client";
import { categories, categoryRules, transactions } from "./schema";

export async function getCategories(userId: string) {
  return db.select().from(categories).where(eq(categories.userId, userId)).orderBy(categories.nome);
}

export async function getRules(userId: string): Promise<Rule[]> {
  return db
    .select({ padrao: categoryRules.padrao, categoryId: categoryRules.categoryId })
    .from(categoryRules)
    .where(eq(categoryRules.userId, userId));
}

/** Categorias usadas quando RECEITA/MOVIMENTACAO não casam com nenhuma regra. */
export async function getFallbackCategories(userId: string) {
  const rows = await db
    .select({ id: categories.id, nome: categories.nome })
    .from(categories)
    .where(and(eq(categories.userId, userId), inArray(categories.nome, ["Receitas", "Movimentação"])));
  const byName = new Map(rows.map((r) => [r.nome, r.id]));
  return { RECEITA: byName.get("Receitas") ?? null, MOVIMENTACAO: byName.get("Movimentação") ?? null };
}

export async function getExistingHashes(userId: string, hashes: string[]): Promise<Set<string>> {
  if (!hashes.length) return new Set();
  const rows = await db
    .select({ hash: transactions.hashUnico })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), inArray(transactions.hashUnico, hashes)));
  return new Set(rows.map((r) => r.hash));
}
