"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { categories, categoryRules } from "@/db/schema";
import { setNomeExtrato } from "@/db/settings";
import { cleanNome } from "@/domain/titular";
import { ruleInputError, ruleTipoAfterCategoryMove } from "@/domain/categorization";
import { isUuid } from "@/domain/guards";
import type { TxType } from "@/domain/picpay-parser";
import { CATEGORY_TIPOS, type CategoryTipo } from "@/domain/tx-type";
import { requireUserId } from "@/lib/auth";

function done() {
  revalidatePath("/", "layout");
  return {};
}

/** Nome do usuário no extrato; vazio desliga o reconhecimento de Pix entre suas contas. Não mexe em transações. */
export async function saveNomeExtrato(nome: string): Promise<{ error?: string }> {
  const userId = await requireUserId();
  if (typeof nome !== "string") return { error: "Nome inválido" };
  await setNomeExtrato(db, userId, cleanNome(nome));
  return done();
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
  if (!(CATEGORY_TIPOS as TxType[]).includes(data.tipo)) return { error: "Tipo inválido" };

  const [dup] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.nome, nome)));
  if (dup && dup.id !== data.id) return { error: "Já existe uma categoria com esse nome" };

  const values = { nome, cor: data.cor, tipo: data.tipo as CategoryTipo };
  if (data.id) {
    const id = data.id;
    await db.transaction(async (tx) => {
      const [cat] = await tx
        .update(categories)
        .set(values)
        .where(and(eq(categories.id, id), eq(categories.userId, userId)))
        .returning({ id: categories.id });
      if (!cat) return;
      // A regra precisa continuar combinando com a categoria (ex.: receita → gasto deixa de ser receita).
      const rules = await tx
        .select({ id: categoryRules.id, tipo: categoryRules.tipo })
        .from(categoryRules)
        .where(and(eq(categoryRules.categoryId, id), eq(categoryRules.userId, userId)));
      for (const r of rules) {
        const tipo = ruleTipoAfterCategoryMove(r.tipo, values.tipo);
        if (tipo !== r.tipo) await tx.update(categoryRules).set({ tipo }).where(eq(categoryRules.id, r.id));
      }
    });
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
  tipo: TxType;
}): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const padrao = data.padrao.trim();
  if (!padrao) return { error: "Informe o texto da regra" };
  // Trocar o tipo no formulário limpa a categoria: "" não pode chegar à consulta (coluna uuid).
  if (typeof data.categoryId !== "string" || !isUuid(data.categoryId)) return { error: "Escolha uma categoria" };

  const [cat] = await db
    .select({ id: categories.id, tipo: categories.tipo })
    .from(categories)
    .where(and(eq(categories.id, data.categoryId), eq(categories.userId, userId)));
  const error = ruleInputError(data.tipo, cat);
  if (error) return { error };

  const values = { padrao, categoryId: data.categoryId, tipo: data.tipo };
  if (data.id) {
    await db
      .update(categoryRules)
      .set(values)
      .where(and(eq(categoryRules.id, data.id), eq(categoryRules.userId, userId)));
  } else {
    await db.insert(categoryRules).values({ userId, ...values });
  }
  return done();
}

export async function deleteRule(id: string): Promise<void> {
  const userId = await requireUserId();
  await db.delete(categoryRules).where(and(eq(categoryRules.id, id), eq(categoryRules.userId, userId)));
  done();
}
