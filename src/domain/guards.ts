import type { TxType } from "./picpay-parser";

const TIPOS: TxType[] = ["GASTO", "RECEITA", "MOVIMENTACAO"];

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Argumentos de server action não são confiáveis: copia só os campos editáveis. */
export function sanitizeTxUpdate(data: Record<string, unknown>): { categoryId?: string | null; tipo?: TxType } {
  const out: { categoryId?: string | null; tipo?: TxType } = {};
  if ("categoryId" in data) {
    if (data.categoryId !== null && typeof data.categoryId !== "string") throw new Error("Categoria inválida");
    out.categoryId = data.categoryId;
  }
  if ("tipo" in data) {
    if (!TIPOS.includes(data.tipo as TxType)) throw new Error("Tipo inválido");
    out.tipo = data.tipo as TxType;
  }
  return out;
}
