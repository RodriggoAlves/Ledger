"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { CreditError } from "@/db/credit";
import { deleteImport } from "@/db/imports";
import { getExistingHashes, getFallbackCategories, getRules } from "@/db/queries";
import { imports, transactions } from "@/db/schema";
import { chunk, isUuid } from "@/domain/guards";
import { buildImportPlan, type ImportPlan } from "@/domain/import-plan";
import { InvalidPicPayFileError, parsePicPayCsv } from "@/domain/picpay-parser";
import { requireUserId } from "@/lib/auth";

const MAX_CHARS = 2 * 1024 * 1024;
const NOT_FOUND = "Importação não encontrada";

class FileTooLargeError extends Error {
  constructor() {
    super("Arquivo muito grande (máx. 2 MB)");
  }
}

export type ImportPreview = {
  total: number;
  duplicadas: number;
  semCategoria: number;
  novas: { dataHora: string; descricao: string; valor: number; categoryId: string | null }[];
  invalidas: ImportPlan["invalidas"];
};

async function plan(userId: string, content: string): Promise<ImportPlan> {
  if (content.length > MAX_CHARS) throw new FileTooLargeError();
  const parsed = parsePicPayCsv(content);
  const [existing, rules, fallback] = await Promise.all([
    getExistingHashes(userId, parsed.rows.map((r) => r.hash)),
    getRules(userId),
    getFallbackCategories(userId),
  ]);
  return buildImportPlan(parsed, existing, rules, fallback);
}

const total = (p: ImportPlan) => p.novas.length + p.duplicadas + p.invalidas.length;

function errorMessage(e: unknown): string {
  if (e instanceof InvalidPicPayFileError || e instanceof FileTooLargeError) return e.message;
  console.error(e);
  return "Não foi possível processar o arquivo";
}

export async function previewImport(content: string): Promise<{ preview?: ImportPreview; error?: string }> {
  const userId = await requireUserId();
  try {
    const p = await plan(userId, content);
    return {
      preview: {
        total: total(p),
        duplicadas: p.duplicadas,
        semCategoria: p.semCategoria,
        novas: p.novas.map((r) => ({
          dataHora: r.dataHora.toISOString(),
          descricao: r.descricao,
          valor: r.valor,
          categoryId: r.categoryId,
        })),
        invalidas: p.invalidas,
      },
    };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function deleteImportAction(importId: string): Promise<{ apagadas?: number; error?: string }> {
  const userId = await requireUserId();
  if (typeof importId !== "string" || !isUuid(importId)) return { error: NOT_FOUND };
  try {
    const res = await deleteImport(db, userId, importId);
    if (!res) return { error: NOT_FOUND };
    revalidatePath("/", "layout");
    return res;
  } catch (e) {
    if (e instanceof CreditError) return { error: e.message };
    console.error(e);
    return { error: "Não foi possível excluir a importação" };
  }
}

/** Reprocessa o conteúdo no servidor (não confia na prévia do cliente) e salva. */
export async function confirmImport(
  fileName: string,
  content: string,
): Promise<{ inseridas?: number; error?: string }> {
  const userId = await requireUserId();
  try {
    const p = await plan(userId, content);
    const inseridas = await db.transaction(async (tx) => {
      const [imp] = await tx
        .insert(imports)
        .values({ userId, nomeArquivo: fileName, linhasTotal: total(p), linhasNovas: p.novas.length })
        .returning({ id: imports.id });
      let inserted = 0;
      // Lotes para não estourar o limite de parâmetros do Postgres (65.535).
      for (const batch of chunk(p.novas, 1000)) {
        const rows = await tx
          .insert(transactions)
          .values(
            batch.map((r) => ({
            userId,
            importId: imp.id,
            dataHora: r.dataHora,
            descricao: r.descricao,
            tipoOriginal: r.tipoOriginal,
            formaPagamento: r.formaPagamento,
            valor: r.valor,
            tipo: r.tipo,
            categoryId: r.categoryId,
            origem: "CSV" as const,
            hashUnico: r.hash,
            })),
          )
          .onConflictDoNothing({ target: [transactions.userId, transactions.hashUnico] })
          .returning({ id: transactions.id });
        inserted += rows.length;
      }
      return inserted;
    });
    revalidatePath("/", "layout");
    return { inseridas };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
