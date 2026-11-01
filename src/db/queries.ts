import "server-only";
import { and, desc, eq, gte, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import type { Rule } from "@/domain/categorization";
import { monthRange, type MonthKey } from "@/domain/month";
import type { TxType } from "@/domain/picpay-parser";
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

/** Meses com transações, mais recente primeiro. */
export async function getAvailableMonths(userId: string): Promise<MonthKey[]> {
  const month = sql<string>`to_char(${transactions.dataHora}, 'YYYY-MM')`;
  const rows = await db
    .selectDistinct({ month })
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(month));
  return rows.map((r) => r.month);
}

export type TransactionFilters = { month: MonthKey; categoryId?: string | "none"; tipo?: TxType };

export async function getTransactions(userId: string, filters: TransactionFilters) {
  const [start, end] = monthRange(filters.month);
  const where: SQL[] = [
    eq(transactions.userId, userId),
    gte(transactions.dataHora, start),
    lt(transactions.dataHora, end),
  ];
  if (filters.categoryId === "none") where.push(isNull(transactions.categoryId));
  else if (filters.categoryId) where.push(eq(transactions.categoryId, filters.categoryId));
  if (filters.tipo) where.push(eq(transactions.tipo, filters.tipo));
  return db
    .select()
    .from(transactions)
    .where(and(...where))
    .orderBy(desc(transactions.dataHora));
}
