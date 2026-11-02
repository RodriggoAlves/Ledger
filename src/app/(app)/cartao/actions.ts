"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { CreditError, markInvoicePaid, setPurchaseCategory } from "@/db/credit";
import { applyInvoiceImport, deleteInvoiceImport, loadCardState } from "@/db/invoice-import";
import { getCategories, getRules } from "@/db/queries";
import { categoryRules, creditPurchases } from "@/db/schema";
import { matchCategory } from "@/domain/categorization";
import { isUuid } from "@/domain/guards";
import { buildInvoiceImportPlan, type InvoiceImportPlan } from "@/domain/invoice-import-plan";
import { resolveLines } from "@/domain/invoice-lines";
import { invoiceErrorMessage, toInvoicePreview, type InvoicePreview } from "@/domain/invoice-preview";
import { parsePicPayInvoice } from "@/domain/picpay-invoice-parser";
import { requireUserId } from "@/lib/auth";
import { extractPdfLines } from "@/lib/pdf-text";

const MAX_BYTES = 5 * 1024 * 1024;

class FileTooLargeError extends CreditError {
  constructor() {
    super("Arquivo muito grande (máx. 5 MB)");
  }
}

function failure(e: unknown, fallback: string): { error: string } {
  if (e instanceof CreditError) return { error: e.message };
  const message = invoiceErrorMessage(e);
  if (message) return { error: message };
  console.error(e);
  return { error: fallback };
}

/** Lê o PDF no servidor e monta o plano contra o estado atual do cartão. */
async function planFromForm(userId: string, form: FormData): Promise<{ file: File; plan: InvoiceImportPlan }> {
  const file = form.get("file");
  if (!(file instanceof File)) throw new CreditError("Escolha o PDF da fatura");
  if (file.size > MAX_BYTES) throw new FileTooLargeError();
  const parsed = parsePicPayInvoice(await extractPdfLines(new Uint8Array(await file.arrayBuffer())));
  const [state, rules] = await Promise.all([loadCardState(db, userId), getRules(userId)]);
  return { file, plan: buildInvoiceImportPlan(parsed, resolveLines(parsed), state, rules) };
}

export async function previewInvoiceAction(form: FormData): Promise<{ preview?: InvoicePreview; error?: string }> {
  const userId = await requireUserId();
  try {
    return { preview: toInvoicePreview((await planFromForm(userId, form)).plan) };
  } catch (e) {
    return failure(e, "Não foi possível processar a fatura");
  }
}

/** Refaz a leitura do mesmo arquivo (não confia na prévia do cliente) e grava. */
export async function confirmInvoiceAction(form: FormData): Promise<{ error?: string }> {
  const userId = await requireUserId();
  try {
    const { file, plan } = await planFromForm(userId, form);
    await applyInvoiceImport(db, userId, file.name, plan);
    revalidatePath("/", "layout");
    return {};
  } catch (e) {
    return failure(e, "Não foi possível importar a fatura");
  }
}

export async function deleteInvoiceImportAction(importId: string): Promise<{ error?: string }> {
  const userId = await requireUserId();
  if (typeof importId !== "string" || !isUuid(importId)) return { error: "Importação não encontrada" };
  try {
    if (!(await deleteInvoiceImport(db, userId, importId))) return { error: "Importação não encontrada" };
    revalidatePath("/", "layout");
    return {};
  } catch (e) {
    return failure(e, "Não foi possível excluir a importação");
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

export async function setPurchaseCategoryAction(purchaseId: string, categoryId: string | null): Promise<{ error?: string }> {
  const userId = await requireUserId();
  if (typeof purchaseId !== "string" || !isUuid(purchaseId)) return { error: "Compra não encontrada" };
  if (categoryId !== null) {
    if (typeof categoryId !== "string" || !(await getCategories(userId)).some((c) => c.id === categoryId)) {
      return { error: "Categoria não encontrada" };
    }
  }
  try {
    if (!(await setPurchaseCategory(db, userId, purchaseId, categoryId))) return { error: "Compra não encontrada" };
    revalidatePath("/", "layout");
    return {};
  } catch (e) {
    return failure(e, "Não foi possível alterar a categoria");
  }
}

/** Cria regra "descrição → categoria" e aplica nas compras do cartão sem categoria que casam. */
export async function createRuleFromPurchaseAction(
  purchaseId: string,
  categoryId: string,
): Promise<{ aplicadas?: number; error?: string }> {
  const userId = await requireUserId();
  if (typeof purchaseId !== "string" || !isUuid(purchaseId)) return { error: "Compra não encontrada" };
  if (!(await getCategories(userId)).some((c) => c.id === categoryId)) return { error: "Categoria não encontrada" };
  const [purchase] = await db
    .select({ descricao: creditPurchases.descricao })
    .from(creditPurchases)
    .where(and(eq(creditPurchases.id, purchaseId), eq(creditPurchases.userId, userId)));
  if (!purchase) return { error: "Compra não encontrada" };

  const rule = { padrao: purchase.descricao, categoryId };
  await db.insert(categoryRules).values({ userId, ...rule });
  const uncategorized = await db
    .select({ id: creditPurchases.id, descricao: creditPurchases.descricao })
    .from(creditPurchases)
    .where(and(eq(creditPurchases.userId, userId), isNull(creditPurchases.categoryId)));
  const ids = uncategorized.filter((p) => matchCategory(p.descricao, [rule])).map((p) => p.id);
  if (ids.length) {
    await db
      .update(creditPurchases)
      .set({ categoryId })
      .where(and(eq(creditPurchases.userId, userId), inArray(creditPurchases.id, ids)));
  }
  revalidatePath("/", "layout");
  return { aplicadas: ids.length };
}
