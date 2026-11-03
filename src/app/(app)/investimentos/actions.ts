"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { cdiOverrides, investments, investmentSnapshots } from "@/db/schema";
import { parseDay, parsePercent, parseReais } from "@/domain/input";
import { todayDate } from "@/domain/month";
import { requireUserId } from "@/lib/auth";

type Result = { error?: string };

function done(): Result {
  revalidatePath("/investimentos");
  revalidatePath("/relatorios");
  return {};
}

/** % do CDI do cofrinho, entre 1% e 300%. */
export async function setInvestmentPercent(id: string, texto: string): Promise<Result> {
  const userId = await requireUserId();
  const percentual = parsePercent(texto);
  if (percentual === null || percentual < 100 || percentual > 30000) return { error: "Informe um % do CDI entre 1 e 300" };
  const res = await db
    .update(investments)
    .set({ percentualCdi: percentual })
    .where(and(eq(investments.id, id), eq(investments.userId, userId)))
    .returning({ id: investments.id });
  if (!res.length) return { error: "Cofrinho não encontrado" };
  return done();
}

/** Saldo real do cofrinho num dia (substitui o informado no mesmo dia). */
export async function addSnapshot(investmentId: string, saldoTexto: string, dataTexto: string): Promise<Result> {
  const userId = await requireUserId();
  const saldo = parseReais(saldoTexto);
  if (saldo === null) return { error: "Informe o saldo em reais, ex.: 1.234,56" };
  const data = parseDay(dataTexto);
  if (!data) return { error: "Data inválida" };
  if (data > todayDate()) return { error: "A data não pode ser no futuro" };

  const [inv] = await db
    .select({ id: investments.id })
    .from(investments)
    .where(and(eq(investments.id, investmentId), eq(investments.userId, userId)));
  if (!inv) return { error: "Cofrinho não encontrado" };

  await db
    .insert(investmentSnapshots)
    .values({ userId, investmentId, data, saldo })
    .onConflictDoUpdate({
      target: [investmentSnapshots.investmentId, investmentSnapshots.data],
      set: { saldo, informadoEm: new Date() },
    });
  return done();
}

export async function deleteSnapshot(id: string): Promise<Result> {
  const userId = await requireUserId();
  await db.delete(investmentSnapshots).where(and(eq(investmentSnapshots.id, id), eq(investmentSnapshots.userId, userId)));
  return done();
}

/** CDI anual manual (0,01% a 100%); `null` volta para o do Banco Central. */
export async function setCdiOverride(texto: string | null): Promise<Result> {
  const userId = await requireUserId();
  if (texto === null) {
    await db.delete(cdiOverrides).where(eq(cdiOverrides.userId, userId));
    return done();
  }
  const taxa = parsePercent(texto);
  if (taxa === null || taxa < 1 || taxa > 10000) return { error: "Informe o CDI anual entre 0,01 e 100" };
  await db
    .insert(cdiOverrides)
    .values({ userId, taxaAnual: taxa })
    .onConflictDoUpdate({ target: cdiOverrides.userId, set: { taxaAnual: taxa, atualizadoEm: new Date() } });
  return done();
}
