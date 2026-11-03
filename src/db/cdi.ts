import { desc, eq, sql } from "drizzle-orm";
import { BCB_CDI_URL, parseBcbCdi, resolveCdi, shouldFetch, type Cdi } from "@/domain/cdi";
import type { Db } from "./client";
import { cdiOverrides, cdiRates } from "./schema";

async function fetchBcb(): Promise<{ data: string; taxaAnual: number }> {
  const res = await fetch(BCB_CDI_URL, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Banco Central respondeu ${res.status}`);
  return parseBcbCdi(await res.json());
}

/**
 * CDI em uso: taxa manual do usuário; senão a do Banco Central, buscada no máximo 1×/dia e guardada
 * em `cdi_rates`. Se a API falhar, segue com a última taxa salva (e só tenta de novo amanhã).
 */
export async function getCdi(db: Db, userId: string, agora = new Date()): Promise<Cdi> {
  const [[override], [latest]] = await Promise.all([
    db.select().from(cdiOverrides).where(eq(cdiOverrides.userId, userId)),
    db.select().from(cdiRates).orderBy(desc(cdiRates.data)).limit(1),
  ]);
  let cached = latest ? { data: latest.data, taxaAnual: latest.taxaAnual } : null;

  if (!override && shouldFetch(latest?.buscadoEm ?? null, agora)) {
    try {
      const novo = await fetchBcb();
      await db
        .insert(cdiRates)
        .values({ ...novo, buscadoEm: agora })
        .onConflictDoUpdate({ target: cdiRates.data, set: { taxaAnual: novo.taxaAnual, buscadoEm: agora } });
      if (!cached || novo.data >= cached.data) cached = novo;
    } catch (err) {
      console.warn("CDI: falha ao consultar o Banco Central", err);
      if (latest) await db.update(cdiRates).set({ buscadoEm: sql`now()` }).where(eq(cdiRates.data, latest.data));
    }
  }
  return resolveCdi({ override: override?.taxaAnual ?? null, cached });
}
