import { and, eq, gte, lt, lte } from "drizzle-orm";
import { buildMonthEntries, type AccountRow, type CardRow, type MonthEntry } from "@/domain/entries";
import { monthKey, monthRange, type MonthKey } from "@/domain/month";
import type { Db } from "./client";
import { creditPurchases, installments, invoices, transactions } from "./schema";

/**
 * Lançamentos de cada mês de `de` a `ate`: transações do extrato pela data e parcelas pela fatura
 * que fecha no mês (`invoices.mes`). As parcelas canceladas vêm marcadas e saem em `buildMonthEntries`.
 * Meses sem nada ficam fora do mapa.
 */
export async function getRangeEntries(db: Db, userId: string, de: MonthKey, ate: MonthKey): Promise<Map<MonthKey, MonthEntry[]>> {
  const [start] = monthRange(de);
  const [, end] = monthRange(ate);
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
        mes: invoices.mes,
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
      .where(and(eq(installments.userId, userId), gte(invoices.mes, de), lte(invoices.mes, ate))),
  ]);

  const accountBy = new Map<MonthKey, AccountRow[]>();
  for (const t of account) {
    const k = monthKey(t.dataHora);
    accountBy.set(k, [...(accountBy.get(k) ?? []), t]);
  }
  const cardBy = new Map<MonthKey, CardRow[]>();
  for (const { mes, canceladaPorImportId, ...p } of card) {
    cardBy.set(mes, [...(cardBy.get(mes) ?? []), { ...p, cancelada: canceladaPorImportId !== null }]);
  }
  const out = new Map<MonthKey, MonthEntry[]>();
  for (const k of new Set([...accountBy.keys(), ...cardBy.keys()])) {
    out.set(k, buildMonthEntries(accountBy.get(k) ?? [], cardBy.get(k) ?? []));
  }
  return out;
}

/** Lançamentos do mês (extrato + parcelas da fatura que fecha no mês), para Dashboard e Transações. */
export async function getMonthEntries(db: Db, userId: string, mes: MonthKey): Promise<MonthEntry[]> {
  return (await getRangeEntries(db, userId, mes, mes)).get(mes) ?? [];
}
