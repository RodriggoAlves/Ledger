import "server-only";
import { db } from "@/db/client";
import { getRangeEntries } from "@/db/entries";
import { getCategories } from "@/db/queries";
import type { MonthKey } from "@/domain/month";
import { fillMonths } from "@/domain/reports/period";

/** Lançamentos de cada mês do período (mesma lista do Dashboard) e as categorias do usuário. */
export async function loadPeriod(userId: string, meses: MonthKey[]) {
  const [dados, cats] = await Promise.all([getRangeEntries(db, userId, meses[0], meses[meses.length - 1]), getCategories(userId)]);
  return { periodo: fillMonths(meses, dados), cats };
}
