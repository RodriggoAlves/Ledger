import type { MonthKey } from "../month";
import { summarizeSpending } from "../summary";
import { countsAsExpense } from "../tx-type";
import type { MonthEntries } from "./period";

type Cat = { id: string; nome: string; cor: string };

export type EvolutionRow = {
  mes: MonthKey;
  entradas: number;
  gastos: number;
  /** Entradas − gastos, como no Dashboard. */
  saldo: number;
  /** Saldo sobre entradas, em % com 1 casa; null sem entradas. */
  poupanca: number | null;
  /** Enviado aos cofrinhos no mês (aportes − resgates). */
  cofrinhos: number;
  saldoAcumulado: number;
};

const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 1000) / 10 : null);

export function monthlyEvolution(
  meses: MonthEntries,
  cats: Cat[],
  cofrinhos: Map<MonthKey, number>,
): { linhas: EvolutionRow[]; totais: Omit<EvolutionRow, "mes" | "saldoAcumulado"> } {
  let acumulado = 0;
  const linhas = meses.map(({ mes, entries }): EvolutionRow => {
    const entradas = entries.filter((e) => e.tipo === "RECEITA").reduce((s, e) => s + e.valor, 0);
    const gastos = summarizeSpending(entries, cats).total;
    const saldo = entradas - gastos;
    acumulado += saldo;
    return { mes, entradas, gastos, saldo, poupanca: pct(saldo, entradas), cofrinhos: cofrinhos.get(mes) ?? 0, saldoAcumulado: acumulado };
  });
  const sum = (k: "entradas" | "gastos" | "saldo" | "cofrinhos") => linhas.reduce((s, l) => s + l[k], 0);
  const entradas = sum("entradas");
  const saldo = sum("saldo");
  return { linhas, totais: { entradas, gastos: sum("gastos"), saldo, poupanca: pct(saldo, entradas), cofrinhos: sum("cofrinhos") } };
}

/** Gasto do mês por meio de pagamento (estornos abatem do cartão). */
export function originSplit(meses: MonthEntries): { mes: MonthKey; conta: number; cartao: number }[] {
  return meses.map(({ mes, entries }) => {
    const total = (origem: "CONTA" | "CARTAO") =>
      entries.filter((e) => countsAsExpense(e.tipo) && e.origem === origem).reduce((s, e) => s - e.valor, 0);
    return { mes, conta: total("CONTA"), cartao: total("CARTAO") };
  });
}
