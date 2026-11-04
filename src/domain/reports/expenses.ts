import type { MonthEntry } from "../entries";
import { countsAsExpense } from "../tx-type";
import type { MonthEntries } from "./period";

const gastos = (meses: MonthEntries) => meses.flatMap((m) => m.entries).filter((e) => countsAsExpense(e.tipo));

/** Os `n` maiores gastos do período (parcelas do cartão contam pelo valor da parcela). */
export function topExpenses(meses: MonthEntries, n: number): MonthEntry[] {
  return gastos(meses)
    .filter((e) => e.valor < 0)
    .sort((a, b) => a.valor - b.valor || b.data.getTime() - a.data.getTime())
    .slice(0, n);
}

const PARCELA = /\s*\d{1,2}\/\d{1,2}$/;
const tidy = (d: string) => d.trim().replace(/\s+/g, " ").replace(PARCELA, "");

/** Chave para agrupar o mesmo estabelecimento: maiúsculas, espaços colapsados, sem "n/m" no fim. */
export function normalizeMerchant(descricao: string): string {
  return tidy(descricao).toUpperCase();
}

/** Estabelecimentos com mais gasto no período; `nome` é a primeira grafia encontrada. */
export function topMerchants(meses: MonthEntries, n: number): { nome: string; total: number; vezes: number }[] {
  const grupos = new Map<string, { nome: string; total: number; vezes: number }>();
  for (const e of gastos(meses)) {
    const key = normalizeMerchant(e.descricao);
    const g = grupos.get(key) ?? { nome: tidy(e.descricao), total: 0, vezes: 0 };
    g.total -= e.valor;
    g.vezes++;
    grupos.set(key, g);
  }
  return [...grupos.values()]
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - a.total || b.vezes - a.vezes || a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, n);
}
