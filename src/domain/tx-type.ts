import type { TxType } from "./picpay-parser";

/**
 * Fica fora de arquivos "use client": um server component que importa um objeto de lá
 * recebe só uma referência ao módulo do cliente, sem as chaves.
 */
export const TIPO_LABEL: Record<TxType, string> = {
  GASTO: "Gasto",
  RECEITA: "Receita",
  MOVIMENTACAO: "Movimentação",
};

export function parseTipo(value: string | undefined): TxType | undefined {
  return value && Object.hasOwn(TIPO_LABEL, value) ? (value as TxType) : undefined;
}
