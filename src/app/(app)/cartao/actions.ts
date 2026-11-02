"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { createPurchase, CreditError, markInvoicePaid, saveCard } from "@/db/credit";
import { getCategories } from "@/db/queries";
import { isUuid } from "@/domain/guards";
import { parsePurchaseForm, type PurchaseForm } from "@/domain/purchase-input";
import { requireUserId } from "@/lib/auth";

const isDay = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 31;

function failure(e: unknown, fallback: string): { error: string } {
  if (e instanceof CreditError) return { error: e.message };
  console.error(e);
  return { error: fallback };
}

export async function saveCardAction(input: {
  nome: string;
  diaFechamento: number;
  diaVencimento: number;
}): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const nome = typeof input?.nome === "string" ? input.nome.trim() : "";
  if (!nome) return { error: "Informe o nome do cartão" };
  if (!isDay(input.diaFechamento) || !isDay(input.diaVencimento)) return { error: "Os dias devem ser de 1 a 31" };
  try {
    await saveCard(db, userId, { nome, diaFechamento: input.diaFechamento, diaVencimento: input.diaVencimento });
    revalidatePath("/", "layout");
    return {};
  } catch (e) {
    return failure(e, "Não foi possível salvar o cartão");
  }
}

export async function markInvoicePaidAction(invoiceId: string): Promise<{ error?: string }> {
  const userId = await requireUserId();
  if (typeof invoiceId !== "string" || !isUuid(invoiceId)) return { error: "Fatura não encontrada" };
  try {
    if (!(await markInvoicePaid(db, userId, invoiceId))) return { error: "Fatura não encontrada" };
    revalidatePath("/", "layout");
    return {};
  } catch (e) {
    return failure(e, "Não foi possível marcar a fatura como paga");
  }
}

export async function createPurchaseAction(form: PurchaseForm): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const parsed = parsePurchaseForm(form);
  if ("error" in parsed) return parsed;
  const { input } = parsed;
  if (input.categoryId) {
    const own = await getCategories(userId);
    if (!own.some((c) => c.id === input.categoryId)) return { error: "Categoria não encontrada" };
  }
  try {
    await createPurchase(db, userId, input);
    revalidatePath("/", "layout");
    return {};
  } catch (e) {
    return failure(e, "Não foi possível salvar a compra");
  }
}
