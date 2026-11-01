"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { categories, categoryRules, transactions } from "@/db/schema";
import { matchCategory } from "@/domain/categorization";
import type { TxType } from "@/domain/picpay-parser";
import { requireUserId } from "@/lib/auth";

async function assertOwnCategory(userId: string, categoryId: string) {
  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));
  if (!cat) throw new Error("Categoria não encontrada");
}

export async function updateTransaction(
  id: string,
  data: { categoryId?: string | null; tipo?: TxType },
): Promise<void> {
  const userId = await requireUserId();
  if (data.categoryId) await assertOwnCategory(userId, data.categoryId);
  await db
    .update(transactions)
    .set(data)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
  revalidatePath("/", "layout");
}

/** Cria regra "descrição → categoria" e aplica nas transações sem categoria que casam. */
export async function createRuleFromTransaction(
  id: string,
  categoryId: string,
): Promise<{ aplicadas: number }> {
  const userId = await requireUserId();
  await assertOwnCategory(userId, categoryId);
  const [tx] = await db
    .select({ descricao: transactions.descricao })
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
  if (!tx) throw new Error("Transação não encontrada");

  const rule = { padrao: tx.descricao, categoryId };
  await db.insert(categoryRules).values({ userId, ...rule });

  const uncategorized = await db
    .select({ id: transactions.id, descricao: transactions.descricao })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), isNull(transactions.categoryId)));
  const ids = uncategorized.filter((t) => matchCategory(t.descricao, [rule])).map((t) => t.id);
  if (ids.length) {
    await db
      .update(transactions)
      .set({ categoryId })
      .where(and(eq(transactions.userId, userId), inArray(transactions.id, ids)));
  }
  revalidatePath("/", "layout");
  return { aplicadas: ids.length };
}
