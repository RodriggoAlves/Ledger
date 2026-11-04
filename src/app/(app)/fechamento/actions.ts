"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { deleteClosing, saveClosing } from "@/db/closings";
import { getMonthEntries } from "@/db/entries";
import { getCategories, getFallbackCategories } from "@/db/queries";
import { transactions } from "@/db/schema";
import { getNomeExtrato } from "@/db/settings";
import { entriesSignature, titularChoiceToUpdate, type TitularChoice } from "@/domain/closing";
import { isUuid } from "@/domain/guards";
import { parseMonth } from "@/domain/month";
import { isTitular } from "@/domain/titular";
import { requireUserId } from "@/lib/auth";

/** "O que foi?" de um Pix entre suas contas: transferência, gasto ou uma categoria de receita. Sem regra. */
export async function classifyTitularEntry(id: string, choice: TitularChoice): Promise<{ error?: string }> {
  const userId = await requireUserId();
  if (typeof id !== "string" || !isUuid(id)) return { error: "Transação não encontrada" };
  const [tx] = await db
    .select({ valor: transactions.valor, descricao: transactions.descricao })
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
  if (!tx) return { error: "Transação não encontrada" };

  const [nome, fallback, cats] = await Promise.all([getNomeExtrato(db, userId), getFallbackCategories(userId), getCategories(userId)]);
  if (!isTitular(tx.descricao, nome)) return { error: "Transação não é sua" };

  const receitaIds = cats.filter((c) => c.tipo === "RECEITA").map((c) => c.id);
  const update = titularChoiceToUpdate(choice, tx.valor, fallback.TRANSFERENCIA_PROPRIA, receitaIds);
  if (!update) return { error: "Opção inválida" };

  await db
    .update(transactions)
    .set(update)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
  revalidatePath("/", "layout");
  return {};
}

/** Fecha (ou refecha) o mês: grava a assinatura atual dos lançamentos, calculada aqui no servidor. */
export async function closeMonthAction(mes: string): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const key = parseMonth(mes);
  if (!key) return { error: "Mês inválido" };
  await saveClosing(db, userId, key, entriesSignature(await getMonthEntries(db, userId, key)));
  revalidatePath("/", "layout");
  return {};
}

export async function reopenMonthAction(mes: string): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const key = parseMonth(mes);
  if (!key) return { error: "Mês inválido" };
  await deleteClosing(db, userId, key);
  revalidatePath("/", "layout");
  return {};
}
