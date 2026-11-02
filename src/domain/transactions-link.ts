import type { EntryFilters } from "./entries";
import type { MonthKey } from "./month";

/** Link para Transações no mês, com os filtros nos mesmos parâmetros que a tela lê. */
export function transactionsHref(mes: MonthKey, { categoryId, tipo, origem }: EntryFilters = {}): string {
  const sp = new URLSearchParams({ mes });
  if (categoryId) sp.set("categoria", categoryId);
  if (tipo) sp.set("tipo", tipo);
  if (origem) sp.set("origem", origem);
  return `/transacoes?${sp}`;
}
