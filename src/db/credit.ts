import { and, asc, eq, isNull, sql, sum } from "drizzle-orm";
import type { InvoiceStatus } from "@/domain/invoice";
import { pairedIndexes } from "@/domain/invoice-lines";
import type { MonthKey } from "@/domain/month";
import type { Db } from "./client";
import { creditCards, creditPurchases, installments, invoices, type CreditCard, type Invoice } from "./schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Erro com mensagem exibível ao usuário. */
export class CreditError extends Error {}

export const BANCO = "PICPAY";

export async function getCard(db: Db | Tx, userId: string): Promise<CreditCard | null> {
  const [card] = await db
    .select()
    .from(creditCards)
    .where(and(eq(creditCards.userId, userId), eq(creditCards.banco, BANCO)));
  return card ?? null;
}

export type { InvoiceStatus } from "@/domain/invoice";

export const invoiceStatus = (i: Pick<Invoice, "paga" | "importId">): InvoiceStatus =>
  i.paga ? "PAGA" : i.importId ? "FECHADA" : "PROJETADA";

/** Parcelas canceladas (projeção que não veio) não contam em nada. */
const active = isNull(installments.canceladaPorImportId);

export async function listInvoices(
  db: Db,
  userId: string,
): Promise<(Invoice & { total: number; status: InvoiceStatus })[]> {
  const rows = await db
    .select({ invoice: invoices, total: sum(installments.valor) })
    .from(invoices)
    .leftJoin(installments, and(eq(installments.invoiceId, invoices.id), active))
    .where(eq(invoices.userId, userId))
    .groupBy(invoices.id)
    .orderBy(asc(invoices.mes));
  return rows.map((r) => ({ ...r.invoice, total: Number(r.total ?? 0), status: invoiceStatus(r.invoice) }));
}

export type InvoiceItem = {
  purchaseId: string;
  descricao: string;
  dataCompra: Date;
  numero: number;
  parcelas: number;
  valor: number;
  categoryId: string | null;
  cartaoFinal: string | null;
  pareada: boolean;
};

export async function getInvoice(
  db: Db,
  userId: string,
  invoiceId: string,
): Promise<{ invoice: Invoice; status: InvoiceStatus; itens: InvoiceItem[] } | null> {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)));
  if (!invoice) return null;
  const rows = await db
    .select({
      purchaseId: creditPurchases.id,
      descricao: creditPurchases.descricao,
      dataCompra: creditPurchases.dataCompra,
      numero: installments.numero,
      parcelas: creditPurchases.parcelas,
      valor: installments.valor,
      categoryId: creditPurchases.categoryId,
      cartaoFinal: creditPurchases.cartaoFinal,
    })
    .from(installments)
    .innerJoin(creditPurchases, eq(creditPurchases.id, installments.purchaseId))
    .where(and(eq(installments.invoiceId, invoiceId), active))
    .orderBy(asc(creditPurchases.dataCompra), asc(creditPurchases.descricao));
  const paired = pairedIndexes(rows);
  return {
    invoice,
    status: invoiceStatus(invoice),
    itens: rows.map((r, i) => ({ ...r, pareada: paired.has(i) })),
  };
}

/** Fatura do cartão PicPay que fecha em `mes`. */
export async function getInvoiceForMonth(
  db: Db,
  userId: string,
  mes: MonthKey,
): Promise<(Invoice & { status: InvoiceStatus }) | null> {
  const [row] = await db
    .select({ invoice: invoices })
    .from(invoices)
    .innerJoin(creditCards, eq(creditCards.id, invoices.cardId))
    .where(and(eq(invoices.userId, userId), eq(invoices.mes, mes), eq(creditCards.banco, BANCO)));
  return row ? { ...row.invoice, status: invoiceStatus(row.invoice) } : null;
}

export async function markInvoicePaid(db: Db, userId: string, invoiceId: string): Promise<boolean> {
  const updated = await db
    .update(invoices)
    .set({ paga: true, pagaEm: sql`now()` })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)))
    .returning({ id: invoices.id });
  return updated.length > 0;
}

export async function setPurchaseCategory(
  db: Db,
  userId: string,
  purchaseId: string,
  categoryId: string | null,
): Promise<boolean> {
  const updated = await db
    .update(creditPurchases)
    .set({ categoryId })
    .where(and(eq(creditPurchases.id, purchaseId), eq(creditPurchases.userId, userId)))
    .returning({ id: creditPurchases.id });
  return updated.length > 0;
}
