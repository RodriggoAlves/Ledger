import { and, asc, eq, inArray } from "drizzle-orm";
import { COFRINHO_TIPOS, parseCofrinhoMovement } from "@/domain/cofrinho";
import type { Db } from "./client";
import { investments, investmentSnapshots, transactions } from "./schema";

export type CofrinhoMovement = { nome: string; data: Date; valor: number };

/** Aportes (+) e resgates (−) de cofrinhos lidos do extrato, mais antigo primeiro. */
export async function getCofrinhoMovements(db: Db, userId: string): Promise<CofrinhoMovement[]> {
  const rows = await db
    .select({
      tipoOriginal: transactions.tipoOriginal,
      descricao: transactions.descricao,
      valor: transactions.valor,
      data: transactions.dataHora,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), inArray(transactions.tipoOriginal, [...COFRINHO_TIPOS])))
    .orderBy(asc(transactions.dataHora));
  return rows.flatMap((r) => {
    const m = parseCofrinhoMovement(r);
    return m ? [{ nome: m.nome, data: r.data, valor: m.valor }] : [];
  });
}

/** Cria um investimento (100% do CDI) para cada cofrinho ainda sem cadastro. */
export async function syncInvestments(db: Db, userId: string, nomes: string[]): Promise<void> {
  const unicos = [...new Set(nomes)];
  if (!unicos.length) return;
  await db
    .insert(investments)
    .values(unicos.map((nome) => ({ userId, nome })))
    .onConflictDoNothing();
}

export async function listInvestments(db: Db, userId: string) {
  return db
    .select({ id: investments.id, nome: investments.nome, percentualCdi: investments.percentualCdi })
    .from(investments)
    .where(eq(investments.userId, userId))
    .orderBy(asc(investments.nome));
}

export async function listSnapshots(db: Db, userId: string) {
  return db
    .select({
      id: investmentSnapshots.id,
      investmentId: investmentSnapshots.investmentId,
      data: investmentSnapshots.data,
      saldo: investmentSnapshots.saldo,
    })
    .from(investmentSnapshots)
    .where(eq(investmentSnapshots.userId, userId))
    .orderBy(asc(investmentSnapshots.data));
}

/** Cofrinhos com movimentos e saldos reais, prontos para o domínio. */
export async function getInvestmentData(db: Db, userId: string) {
  const movs = await getCofrinhoMovements(db, userId);
  await syncInvestments(
    db,
    userId,
    movs.map((m) => m.nome),
  );
  const [invs, snaps] = await Promise.all([listInvestments(db, userId), listSnapshots(db, userId)]);
  return invs.map((inv) => ({
    ...inv,
    movs: movs.filter((m) => m.nome === inv.nome).map(({ data, valor }) => ({ data, valor })),
    snaps: snaps.filter((s) => s.investmentId === inv.id),
  }));
}
