import { and, asc, eq, inArray, sql, sum } from "drizzle-orm";
import { invoiceDates, planInstallments, type CardDays } from "@/domain/invoice";
import type { MonthKey } from "@/domain/month";
import type { PurchaseInput } from "@/domain/purchase-input";
import type { Db } from "./client";
import {
  creditCards,
  creditPurchases,
  installments,
  invoices,
  transactions,
  type CreditCard,
  type Invoice,
} from "./schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Erro com mensagem exibível ao usuário. */
export class CreditError extends Error {}

const MAX_PARCELAS = 48;

export async function getCard(db: Db | Tx, userId: string): Promise<CreditCard | null> {
  const [card] = await db.select().from(creditCards).where(eq(creditCards.userId, userId));
  return card ?? null;
}

export async function saveCard(
  db: Db,
  userId: string,
  input: { nome: string; diaFechamento: number; diaVencimento: number },
): Promise<CreditCard> {
  const [card] = await db
    .insert(creditCards)
    .values({ userId, ...input })
    .onConflictDoUpdate({ target: creditCards.userId, set: input })
    .returning();
  return card;
}

function validateCounts(parcelas: number, jaPagas: number) {
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > MAX_PARCELAS) {
    throw new CreditError("Número de parcelas inválido");
  }
  if (!Number.isInteger(jaPagas) || jaPagas < 0 || jaPagas > parcelas) {
    throw new CreditError("Parcelas pagas maior que o total");
  }
}

async function requireCard(tx: Tx, userId: string): Promise<CreditCard> {
  const card = await getCard(tx, userId);
  if (!card) throw new CreditError("Configure o cartão antes");
  return card;
}

/** Garante a fatura do mês (cria sob demanda) e devolve o id. */
async function invoiceId(tx: Tx, userId: string, card: CreditCard, mes: MonthKey): Promise<string> {
  const days: CardDays = card;
  await tx
    .insert(invoices)
    .values({ userId, cardId: card.id, mes, ...invoiceDates(mes, days) })
    .onConflictDoNothing({ target: [invoices.cardId, invoices.mes] });
  const [inv] = await tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.cardId, card.id), eq(invoices.mes, mes)));
  return inv.id;
}

async function insertPurchase(
  tx: Tx,
  userId: string,
  card: CreditCard,
  p: { descricao: string; categoryId: string | null; dataCompra: Date; valorTotal: number; parcelas: number; jaPagas: number; transactionId?: string },
): Promise<string> {
  const [purchase] = await tx
    .insert(creditPurchases)
    .values({
      userId,
      cardId: card.id,
      descricao: p.descricao,
      categoryId: p.categoryId,
      valorTotal: p.valorTotal,
      parcelas: p.parcelas,
      dataCompra: p.dataCompra,
      transactionId: p.transactionId,
    })
    .returning({ id: creditPurchases.id });

  for (const planned of planInstallments(p, card)) {
    await tx.insert(installments).values({
      userId,
      purchaseId: purchase.id,
      invoiceId: await invoiceId(tx, userId, card, planned.mes),
      numero: planned.numero,
      valor: planned.valor,
      paga: planned.paga,
    });
  }
  return purchase.id;
}

export async function createPurchase(db: Db, userId: string, input: PurchaseInput): Promise<{ purchaseId: string }> {
  validateCounts(input.parcelas, input.jaPagas);
  const valorTotal = "valorTotal" in input ? input.valorTotal : input.valorParcela * input.parcelas;
  if (!Number.isInteger(valorTotal) || valorTotal <= 0) throw new CreditError("Valor inválido");
  return db.transaction(async (tx) => {
    const card = await requireCard(tx, userId);
    return { purchaseId: await insertPurchase(tx, userId, card, { ...input, valorTotal }) };
  });
}

export async function convertTransaction(
  db: Db,
  userId: string,
  transactionId: string,
  input: { parcelas: number; jaPagas: number },
): Promise<{ purchaseId: string }> {
  validateCounts(input.parcelas, input.jaPagas);
  return db.transaction(async (tx) => {
    const card = await requireCard(tx, userId);
    const [t] = await tx
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)));
    if (!t) throw new CreditError("Transação não encontrada");
    if (t.tipo !== "GASTO") throw new CreditError("Só gastos podem ir para o crédito");
    if (t.convertidaCredito) throw new CreditError("Transação já convertida");

    const purchaseId = await insertPurchase(tx, userId, card, {
      descricao: t.descricao,
      categoryId: t.categoryId,
      dataCompra: t.dataHora,
      valorTotal: -t.valor,
      ...input,
      transactionId,
    });
    await tx.update(transactions).set({ convertidaCredito: true }).where(eq(transactions.id, transactionId));
    return { purchaseId };
  });
}

/** Remove as compras ligadas às transações (parcelas em cascata). Usado também ao excluir importação. */
export async function deletePurchasesOf(tx: Tx, userId: string, transactionIds: string[]): Promise<void> {
  if (!transactionIds.length) return;
  await tx
    .delete(creditPurchases)
    .where(and(eq(creditPurchases.userId, userId), inArray(creditPurchases.transactionId, transactionIds)));
}

export async function undoConversion(db: Db, userId: string, transactionId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await deletePurchasesOf(tx, userId, [transactionId]);
    await tx
      .update(transactions)
      .set({ convertidaCredito: false })
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)));
  });
}

export async function listInvoices(db: Db, userId: string): Promise<(Invoice & { total: number })[]> {
  const rows = await db
    .select({ invoice: invoices, total: sum(installments.valor) })
    .from(invoices)
    .leftJoin(installments, eq(installments.invoiceId, invoices.id))
    .where(eq(invoices.userId, userId))
    .groupBy(invoices.id)
    .orderBy(asc(invoices.mes));
  return rows.map((r) => ({ ...r.invoice, total: Number(r.total ?? 0) }));
}

export async function getInvoice(
  db: Db,
  userId: string,
  invoiceId: string,
): Promise<{ invoice: Invoice; itens: { descricao: string; numero: number; parcelas: number; valor: number }[] } | null> {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)));
  if (!invoice) return null;
  const itens = await db
    .select({
      descricao: creditPurchases.descricao,
      numero: installments.numero,
      parcelas: creditPurchases.parcelas,
      valor: installments.valor,
    })
    .from(installments)
    .innerJoin(creditPurchases, eq(creditPurchases.id, installments.purchaseId))
    .where(eq(installments.invoiceId, invoiceId))
    .orderBy(asc(creditPurchases.dataCompra), asc(creditPurchases.descricao));
  return { invoice, itens };
}

export async function markInvoicePaid(db: Db, userId: string, invoiceId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(invoices)
      .set({ paga: true, pagaEm: sql`now()` })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)))
      .returning({ id: invoices.id });
    if (!updated.length) return false;
    await tx.update(installments).set({ paga: true }).where(eq(installments.invoiceId, invoiceId));
    return true;
  });
}

/** Parcelas das faturas que fecham no mês, para somar nos gastos do dashboard. */
export async function getInstallmentsForMonth(
  db: Db,
  userId: string,
  mes: MonthKey,
): Promise<{ valor: number; categoryId: string | null }[]> {
  return db
    .select({ valor: installments.valor, categoryId: creditPurchases.categoryId })
    .from(installments)
    .innerJoin(invoices, eq(invoices.id, installments.invoiceId))
    .innerJoin(creditPurchases, eq(creditPurchases.id, installments.purchaseId))
    .where(and(eq(installments.userId, userId), eq(invoices.mes, mes)));
}
