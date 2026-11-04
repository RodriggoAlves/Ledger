import { and, eq, inArray, sql } from "drizzle-orm";
import type { MonthKey } from "@/domain/month";
import type { Db } from "./client";
import { monthClosings } from "./schema";

export type Closing = { mes: MonthKey; assinatura: string; fechadoEm: Date };

/** Fechamentos dos meses pedidos, por mês. */
export async function getClosings(db: Db, userId: string, meses: MonthKey[]): Promise<Map<MonthKey, Closing>> {
  if (!meses.length) return new Map();
  const rows = await db
    .select({ mes: monthClosings.mes, assinatura: monthClosings.assinatura, fechadoEm: monthClosings.fechadoEm })
    .from(monthClosings)
    .where(and(eq(monthClosings.userId, userId), inArray(monthClosings.mes, meses)));
  return new Map(rows.map((r) => [r.mes, r]));
}

/** Fecha (ou refecha) o mês com a assinatura atual dos lançamentos. */
export async function saveClosing(db: Db, userId: string, mes: MonthKey, assinatura: string): Promise<void> {
  await db
    .insert(monthClosings)
    .values({ userId, mes, assinatura })
    .onConflictDoUpdate({
      target: [monthClosings.userId, monthClosings.mes],
      set: { assinatura, fechadoEm: sql`now()` },
    });
}

export async function deleteClosing(db: Db, userId: string, mes: MonthKey): Promise<void> {
  await db.delete(monthClosings).where(and(eq(monthClosings.userId, userId), eq(monthClosings.mes, mes)));
}
