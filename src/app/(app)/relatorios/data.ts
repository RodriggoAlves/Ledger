import "server-only";
import { cache } from "react";
import { db } from "@/db/client";
import { getClosings } from "@/db/closings";
import { getRangeEntries } from "@/db/entries";
import { getCategories } from "@/db/queries";
import { closedPeriod } from "@/domain/closing";
import type { MonthKey } from "@/domain/month";
import { fillMonths } from "@/domain/reports/period";

/**
 * Lançamentos dos meses **fechados** do período (mesma lista do Dashboard), as categorias e quais meses
 * ficaram de fora (abertos) ou mudaram depois do fechamento. Em cache por requisição: a página e a seção
 * pedem o mesmo período.
 */
export const loadPeriod = cache(async (userId: string, meses: MonthKey[]) => {
  const [dados, cats, closings] = await Promise.all([
    getRangeEntries(db, userId, meses[0], meses[meses.length - 1]),
    getCategories(userId),
    getClosings(db, userId, meses),
  ]);
  return { ...closedPeriod(fillMonths(meses, dados), closings), cats };
});
