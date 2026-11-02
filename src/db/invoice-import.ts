import { and, desc, eq, inArray, isNotNull, notExists } from "drizzle-orm";
import { invoiceDates } from "@/domain/invoice";
import type { CardState, InvoiceImportPlan } from "@/domain/invoice-import-plan";
import { formatMonth, type MonthKey } from "@/domain/month";
import type { Db } from "./client";
import { BANCO, CreditError, getCard } from "./credit";
import { creditCards, creditPurchases, installments, invoiceImports, invoices, type CreditCard } from "./schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function loadCardState(db: Db, userId: string): Promise<CardState> {
  const card = await getCard(db, userId);
  if (!card) return { importedMonths: [], purchases: [] };

  const imported = await db
    .select({ mes: invoices.mes })
    .from(invoices)
    .where(and(eq(invoices.cardId, card.id), isNotNull(invoices.importId)));
  const rows = await db
    .select({
      purchaseId: creditPurchases.id,
      chave: creditPurchases.chave,
      descricao: creditPurchases.descricao,
      parcelas: creditPurchases.parcelas,
      id: installments.id,
      numero: installments.numero,
      mes: invoices.mes,
      confirmada: installments.confirmadaPorImportId,
      cancelada: installments.canceladaPorImportId,
    })
    .from(creditPurchases)
    .innerJoin(installments, eq(installments.purchaseId, creditPurchases.id))
    .innerJoin(invoices, eq(invoices.id, installments.invoiceId))
    .where(eq(creditPurchases.cardId, card.id));

  const purchases = new Map<string, CardState["purchases"][number]>();
  for (const r of rows) {
    const p = purchases.get(r.purchaseId) ?? {
      id: r.purchaseId,
      chave: r.chave,
      descricao: r.descricao,
      parcelas: r.parcelas,
      installments: [],
    };
    p.installments.push({ id: r.id, numero: r.numero, mes: r.mes, confirmada: !!r.confirmada, cancelada: !!r.cancelada });
    purchases.set(r.purchaseId, p);
  }
  return { importedMonths: imported.map((i) => i.mes), purchases: [...purchases.values()] };
}

/** Garante a fatura do mês (projetada, com datas pelos dias do cartão) e devolve o id. */
async function invoiceIdFor(tx: Tx, userId: string, card: CreditCard, mes: MonthKey): Promise<string> {
  await tx
    .insert(invoices)
    .values({ userId, cardId: card.id, mes, ...invoiceDates(mes, card) })
    .onConflictDoNothing({ target: [invoices.cardId, invoices.mes] });
  const [inv] = await tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.cardId, card.id), eq(invoices.mes, mes)));
  return inv.id;
}

/** Cria/atualiza o cartão PicPay com os dias do PDF e grava o plano. Devolve o id da importação. */
export async function applyInvoiceImport(
  db: Db,
  userId: string,
  fileName: string,
  plan: InvoiceImportPlan,
): Promise<string> {
  return db.transaction(async (tx) => {
    const days = { diaFechamento: plan.fechamento.getUTCDate(), diaVencimento: plan.vencimento.getUTCDate() };
    const [card] = await tx
      .insert(creditCards)
      .values({ userId, banco: BANCO, nome: "PicPay", ...days })
      .onConflictDoUpdate({ target: [creditCards.userId, creditCards.banco], set: days })
      .returning();

    const [invoice] = await tx
      .insert(invoices)
      .values({ userId, cardId: card.id, mes: plan.mes, fechamento: plan.fechamento, vencimento: plan.vencimento })
      .onConflictDoUpdate({
        target: [invoices.cardId, invoices.mes],
        set: { fechamento: plan.fechamento, vencimento: plan.vencimento },
      })
      .returning({ id: invoices.id });
    const [imp] = await tx
      .insert(invoiceImports)
      .values({
        userId,
        cardId: card.id,
        invoiceId: invoice.id,
        nomeArquivo: fileName,
        totalLancamentos: plan.totalGeral,
        linhas: plan.novas.length + plan.confirmar.length + plan.ignoradas,
      })
      .returning({ id: invoiceImports.id });
    await tx.update(invoices).set({ importId: imp.id }).where(eq(invoices.id, invoice.id));

    const ids = new Map<MonthKey, string>([[plan.mes, invoice.id]]);
    const idFor = async (mes: MonthKey) => {
      if (!ids.has(mes)) ids.set(mes, await invoiceIdFor(tx, userId, card, mes));
      return ids.get(mes)!;
    };

    for (const n of plan.novas) {
      const [purchase] = await tx
        .insert(creditPurchases)
        .values({
          userId,
          cardId: card.id,
          importId: imp.id,
          tipo: n.tipo,
          chave: n.chave,
          descricao: n.descricao,
          categoryId: n.categoryId,
          valorTotal: n.valorParcela * n.parcelas,
          parcelas: n.parcelas,
          parcelaInicial: n.parcelaInicial,
          dataCompra: n.dataCompra,
          cartaoFinal: n.cartaoFinal,
        })
        .returning({ id: creditPurchases.id });
      for (const i of n.installments) {
        await tx.insert(installments).values({
          userId,
          purchaseId: purchase.id,
          invoiceId: await idFor(i.mes),
          numero: i.numero,
          valor: n.valorParcela,
          confirmadaPorImportId: i.confirmada ? imp.id : null,
        });
      }
    }

    const mine = (column: typeof installments.id, list: string[]) =>
      and(eq(installments.userId, userId), inArray(column, list));
    if (plan.confirmar.length) {
      await tx
        .update(installments)
        .set({ confirmadaPorImportId: imp.id })
        .where(mine(installments.id, plan.confirmar.map((c) => c.installmentId)));
    }
    for (const m of plan.mover) {
      await tx
        .update(installments)
        .set({ invoiceId: await idFor(m.mes) })
        .where(mine(installments.id, [m.installmentId]));
    }
    if (plan.cancelar.length) {
      await tx
        .update(installments)
        .set({ canceladaPorImportId: imp.id })
        .where(mine(installments.id, plan.cancelar.map((c) => c.installmentId)));
    }
    if (plan.pagarMes) {
      await tx
        .update(invoices)
        .set({ paga: true, pagaEm: plan.pagaEm, pagaPorImportId: imp.id })
        .where(and(eq(invoices.cardId, card.id), eq(invoices.mes, plan.pagarMes), eq(invoices.paga, false)));
    }
    return imp.id;
  });
}

export type InvoiceImportSummary = { id: string; nomeArquivo: string; criadoEm: Date; mes: MonthKey };

/** Importações de fatura, da fatura mais recente para a mais antiga. */
export async function listInvoiceImports(db: Db, userId: string): Promise<InvoiceImportSummary[]> {
  return db
    .select({
      id: invoiceImports.id,
      nomeArquivo: invoiceImports.nomeArquivo,
      criadoEm: invoiceImports.criadoEm,
      mes: invoices.mes,
    })
    .from(invoiceImports)
    .innerJoin(invoices, eq(invoices.id, invoiceImports.invoiceId))
    .where(eq(invoiceImports.userId, userId))
    .orderBy(desc(invoices.mes));
}

/**
 * Desfaz uma importação de fatura. null = não encontrada (ou de outro usuário).
 * Só a mais recente do cartão pode ser excluída. Parcelas reprojetadas por ela continuam onde estão.
 */
export async function deleteInvoiceImport(db: Db, userId: string, importId: string): Promise<{ ok: true } | null> {
  return db.transaction(async (tx) => {
    const [imp] = await tx
      .select({ id: invoiceImports.id, cardId: invoiceImports.cardId, invoiceId: invoiceImports.invoiceId, mes: invoices.mes })
      .from(invoiceImports)
      .innerJoin(invoices, eq(invoices.id, invoiceImports.invoiceId))
      .where(and(eq(invoiceImports.id, importId), eq(invoiceImports.userId, userId)));
    if (!imp) return null;

    const [latest] = await tx
      .select({ mes: invoices.mes })
      .from(invoices)
      .where(and(eq(invoices.cardId, imp.cardId), isNotNull(invoices.importId)))
      .orderBy(desc(invoices.mes))
      .limit(1);
    if (latest.mes !== imp.mes) throw new CreditError(`Exclua primeiro a fatura de ${formatMonth(latest.mes)}`);

    await tx
      .update(installments)
      .set({ confirmadaPorImportId: null })
      .where(eq(installments.confirmadaPorImportId, imp.id));
    await tx
      .update(installments)
      .set({ canceladaPorImportId: null })
      .where(eq(installments.canceladaPorImportId, imp.id));
    await tx
      .update(invoices)
      .set({ paga: false, pagaEm: null, pagaPorImportId: null })
      .where(eq(invoices.pagaPorImportId, imp.id));
    await tx.update(invoices).set({ importId: null }).where(eq(invoices.id, imp.invoiceId));
    // Apaga as compras criadas por ela (parcelas em cascata) e o registro da importação.
    await tx.delete(creditPurchases).where(eq(creditPurchases.importId, imp.id));
    await tx.delete(invoiceImports).where(eq(invoiceImports.id, imp.id));
    // Faturas projetadas que ficaram sem parcelas.
    await tx
      .delete(invoices)
      .where(
        and(
          eq(invoices.cardId, imp.cardId),
          eq(invoices.paga, false),
          notExists(tx.select({ id: installments.id }).from(installments).where(eq(installments.invoiceId, invoices.id))),
          notExists(
            tx.select({ id: invoiceImports.id }).from(invoiceImports).where(eq(invoiceImports.invoiceId, invoices.id)),
          ),
        ),
      );
    return { ok: true };
  });
}
