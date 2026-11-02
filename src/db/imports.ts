import { and, count, desc, eq, inArray, max, min } from "drizzle-orm";
import type { Db } from "./client";
import { CreditError, deletePurchasesOf } from "./credit";
import { creditPurchases, imports, installments, invoices, transactions } from "./schema";

export type ImportSummary = {
  id: string;
  nomeArquivo: string;
  criadoEm: Date;
  transacoes: number;
  inicio: Date | null;
  fim: Date | null;
};

/** Importações do usuário, mais recente primeiro, com contagem e período atuais. */
export async function listImports(db: Db, userId: string): Promise<ImportSummary[]> {
  const rows = await db
    .select({
      id: imports.id,
      nomeArquivo: imports.nomeArquivo,
      criadoEm: imports.criadoEm,
      transacoes: count(transactions.id),
      inicio: min(transactions.dataHora),
      fim: max(transactions.dataHora),
    })
    .from(imports)
    .leftJoin(transactions, eq(transactions.importId, imports.id))
    .where(eq(imports.userId, userId))
    .groupBy(imports.id)
    .orderBy(desc(imports.criadoEm));
  return rows.map((r) => ({ ...r, transacoes: Number(r.transacoes) }));
}

/**
 * Apaga a importação e todas as suas transações, desfazendo conversões em crédito.
 * null se não existe ou não é do usuário; CreditError se alguma parcela já está em fatura paga.
 */
export async function deleteImport(db: Db, userId: string, importId: string): Promise<{ apagadas: number } | null> {
  return db.transaction(async (tx) => {
    const [imp] = await tx
      .select({ id: imports.id })
      .from(imports)
      .where(and(eq(imports.id, importId), eq(imports.userId, userId)));
    if (!imp) return null;

    const ids = (
      await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.importId, importId), eq(transactions.userId, userId)))
    ).map((t) => t.id);

    // Compras convertidas em crédito: bloqueia se já há parcela em fatura paga; senão desfaz a conversão.
    if (ids.length) {
      const [paid] = await tx
        .select({ id: installments.id })
        .from(installments)
        .innerJoin(creditPurchases, eq(creditPurchases.id, installments.purchaseId))
        .innerJoin(invoices, eq(invoices.id, installments.invoiceId))
        .where(and(inArray(creditPurchases.transactionId, ids), eq(invoices.paga, true)))
        .limit(1);
      if (paid) {
        throw new CreditError("Esta importação tem compras em faturas pagas. Desfaça a conversão delas antes de excluir.");
      }
      await deletePurchasesOf(tx, userId, ids);
    }

    const apagadas = await tx
      .delete(transactions)
      .where(and(eq(transactions.importId, importId), eq(transactions.userId, userId)))
      .returning({ id: transactions.id });
    await tx.delete(imports).where(eq(imports.id, importId));
    return { apagadas: apagadas.length };
  });
}
