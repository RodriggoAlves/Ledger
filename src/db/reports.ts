import { and, asc, eq, gte, isNull } from "drizzle-orm";
import { monthRange, type MonthKey } from "@/domain/month";
import type { UnpaidInstallment } from "@/domain/reports/card";
import type { Db } from "./client";
import { creditPurchases, installments, invoices } from "./schema";

/**
 * Parcelas ativas de faturas não pagas que vencem a partir de `desde` (o mês atual), para o
 * comprometimento futuro. Faturas antigas esquecidas como "não pagas" ficam de fora.
 */
export async function getUnpaidInstallments(db: Db, userId: string, desde: MonthKey): Promise<UnpaidInstallment[]> {
  const rows = await db
    .select({
      mes: invoices.mes,
      vencimento: invoices.vencimento,
      importId: invoices.importId,
      purchaseId: creditPurchases.id,
      descricao: creditPurchases.descricao,
      numero: installments.numero,
      parcelas: creditPurchases.parcelas,
      valor: installments.valor,
    })
    .from(installments)
    .innerJoin(invoices, eq(invoices.id, installments.invoiceId))
    .innerJoin(creditPurchases, eq(creditPurchases.id, installments.purchaseId))
    .where(
      and(
        eq(installments.userId, userId),
        isNull(installments.canceladaPorImportId),
        eq(invoices.paga, false),
        gte(invoices.vencimento, monthRange(desde)[0]),
      ),
    )
    .orderBy(asc(invoices.mes), asc(creditPurchases.descricao));
  return rows.map(({ importId, ...r }) => ({ ...r, status: importId ? "FECHADA" : "PROJETADA" }));
}
