import type { TxType } from "./picpay-parser";
import { categoryTipo } from "./tx-type";

/**
 * Categorias que o seletor de uma linha oferece: as do tipo da linha (estorno usa as de gasto),
 * mais a atual quando for de outro tipo (ex.: o tipo foi trocado), para o seletor não ficar vazio.
 * Mantém a ordem recebida.
 */
export function categoriesForType<C extends { id: string; tipo: TxType }>(
  categories: C[],
  tipo: TxType,
  currentId: string | null,
): C[] {
  const alvo = categoryTipo(tipo);
  return categories.filter((c) => c.tipo === alvo || c.id === currentId);
}

/** Opções do filtro de categoria em Transações: sem tipo escolhido, todas; com tipo, as dele. */
export function categoryFilterOptions<C extends { id: string; tipo: TxType }>(
  categories: C[],
  tipo: TxType | undefined,
  selectedId: string | undefined,
): C[] {
  return tipo ? categoriesForType(categories, tipo, selectedId ?? null) : categories;
}
