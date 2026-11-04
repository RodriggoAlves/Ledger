import type { TxType } from "./picpay-parser";

/**
 * Fica fora de arquivos "use client": um server component que importa um objeto de lá
 * recebe só uma referência ao módulo do cliente, sem as chaves.
 */
export const TIPO_LABEL: Record<TxType, string> = {
  GASTO: "Gasto",
  ESTORNO: "Estorno",
  RECEITA: "Receita",
  MOVIMENTACAO: "Movimentação",
};

/** Tipos que uma categoria pode ter: estorno não tem categorias próprias, usa as de gasto. */
export type CategoryTipo = Exclude<TxType, "ESTORNO">;
export const CATEGORY_TIPOS: CategoryTipo[] = ["GASTO", "RECEITA", "MOVIMENTACAO"];

/** Única definição de "conta como gasto": o estorno (positivo) abate da categoria. */
export function countsAsExpense(tipo: TxType): boolean {
  return tipo === "GASTO" || tipo === "ESTORNO";
}

/** Tipo das categorias que um lançamento deste tipo usa. */
export function categoryTipo(tipo: TxType): CategoryTipo {
  return tipo === "ESTORNO" ? "GASTO" : tipo;
}

/** Opções do filtro de tipo em Transações: "Gasto" traz os estornos junto, como o card Gastos soma. */
export function tipoFilterOptions(): { value: TxType; label: string }[] {
  return (Object.keys(TIPO_LABEL) as TxType[]).map((value) => ({
    value,
    label: value === "GASTO" ? "Gastos e estornos" : TIPO_LABEL[value],
  }));
}

export function parseTipo(value: string | undefined): TxType | undefined {
  return value && Object.hasOwn(TIPO_LABEL, value) ? (value as TxType) : undefined;
}
