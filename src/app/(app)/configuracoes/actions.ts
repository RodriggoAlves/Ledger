"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { categories, categoryRules } from "@/db/schema";
import type { TxType } from "@/domain/picpay-parser";
import { requireUserId } from "@/lib/auth";

const TIPOS: TxType[] = ["GASTO", "RECEITA", "MOVIMENTACAO"];

function done() {
  revalidatePath("/", "layout");
  return {};
}

export async function upsertCategory(data: {
  id?: string;
  nome: string;
  cor: string;
  tipo: TxType;
}): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const nome = data.nome.trim();
  if (!nome) return { error: "Informe o nome" };
  if (!/^#[0-9a-f]{6}$/i.test(data.cor)) return { error: "Cor inválida" };
  if (!TIPOS.includes(data.tipo)) return { error: "Tipo inválido" };

  const [dup] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.nome, nome)));
  if (dup && dup.id !== data.id) return { error: "Já existe uma categoria com esse nome" };

  const values = { nome, cor: data.cor, tipo: data.tipo };
  if (data.id) {
    await db
      .update(categories)
      .set(values)
      .where(and(eq(categories.id, data.id), eq(categories.userId, userId)));
  } else {
    await db.insert(categories).values({ userId, ...values });
  }
  return done();
}

/** Transações da categoria ficam sem categoria; regras dela são removidas. */
export async function deleteCategory(id: string): Promise<void> {
  const userId = await requireUserId();
  await db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)));
  done();
}

export async function upsertRule(data: {
  id?: string;
  padrao: string;
  categoryId: string;
}): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const padrao = data.padrao.trim();
  if (!padrao) return { error: "Informe o texto da regra" };

  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, data.categoryId), eq(categories.userId, userId)));
  if (!cat) return { error: "Escolha uma categoria" };

  if (data.id) {
    await db
      .update(categoryRules)
      .set({ padrao, categoryId: data.categoryId })
      .where(and(eq(categoryRules.id, data.id), eq(categoryRules.userId, userId)));
  } else {
    await db.insert(categoryRules).values({ userId, padrao, categoryId: data.categoryId });
  }
  return done();
}

export async function deleteRule(id: string): Promise<void> {
  const userId = await requireUserId();
  await db.delete(categoryRules).where(and(eq(categoryRules.id, id), eq(categoryRules.userId, userId)));
  done();
}
