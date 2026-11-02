import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Rule } from "@/domain/categorization";
import type { MonthKey } from "@/domain/month";
import { db } from "./client";
import { categories, categoryRules, invoices, transactions } from "./schema";

export async function getCategories(userId: string) {
  return db.select().from(categories).where(eq(categories.userId, userId)).orderBy(categories.nome);
}

export async function getRules(userId: string): Promise<Rule[]> {
  return db
    .select({ padrao: categoryRules.padrao, categoryId: categoryRules.categoryId })
    .from(categoryRules)
    .where(eq(categoryRules.userId, userId));
}

export async function getRulesWithIds(userId: string) {
  return db
    .select({ id: categoryRules.id, padrao: categoryRules.padrao, categoryId: categoryRules.categoryId })
    .from(categoryRules)
    .where(eq(categoryRules.userId, userId))
    .orderBy(categoryRules.padrao);
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

/** Meses com transações ou com fatura do cartão, mais recente primeiro. */
export async function getAvailableMonths(userId: string): Promise<MonthKey[]> {
  const month = sql<string>`to_char(${transactions.dataHora}, 'YYYY-MM')`;
  const [txMonths, invoiceMonths] = await Promise.all([
    db.selectDistinct({ month }).from(transactions).where(eq(transactions.userId, userId)),
    db.selectDistinct({ month: invoices.mes }).from(invoices).where(eq(invoices.userId, userId)),
  ]);
  return [...new Set([...txMonths, ...invoiceMonths].map((r) => r.month))].sort().reverse();
}
