import { and, eq, gte, lt } from "drizzle-orm";
import { buildMonthEntries, type MonthEntry } from "@/domain/entries";
import { monthRange, type MonthKey } from "@/domain/month";
import type { Db } from "./client";
import { creditPurchases, installments, invoices, transactions } from "./schema";

/**
 * Lançamentos do mês: transações do extrato com data no mês e parcelas da fatura que fecha no mês
 * (`invoices.mes`). As parcelas canceladas vêm marcadas e saem em `buildMonthEntries`.
 */
export async function getMonthEntries(db: Db, userId: string, mes: MonthKey): Promise<MonthEntry[]> {
  const [start, end] = monthRange(mes);
  const [account, card] = await Promise.all([
    db
      .select({
        id: transactions.id,
        dataHora: transactions.dataHora,
        descricao: transactions.descricao,
        valor: transactions.valor,
        tipo: transactions.tipo,
        categoryId: transactions.categoryId,
        formaPagamento: transactions.formaPagamento,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), gte(transactions.dataHora, start), lt(transactions.dataHora, end))),
    db
      .select({
        installmentId: installments.id,
        purchaseId: creditPurchases.id,
        dataCompra: creditPurchases.dataCompra,
        descricao: creditPurchases.descricao,
        valor: installments.valor,
        numero: installments.numero,
        parcelas: creditPurchases.parcelas,
        categoryId: creditPurchases.categoryId,
        tipo: creditPurchases.tipo,
        canceladaPorImportId: installments.canceladaPorImportId,
      })
      .from(installments)
      .innerJoin(invoices, eq(invoices.id, installments.invoiceId))
      .innerJoin(creditPurchases, eq(creditPurchases.id, installments.purchaseId))
      .where(and(eq(installments.userId, userId), eq(invoices.mes, mes))),
  ]);
  return buildMonthEntries(
    account,
    card.map(({ canceladaPorImportId, ...p }) => ({ ...p, cancelada: canceladaPorImportId !== null })),
  );
}
