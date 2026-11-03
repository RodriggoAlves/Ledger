import type { MonthEntry } from "../entries";
import { addMonths } from "../invoice";
import type { MonthKey } from "../month";

/** Lançamentos de cada mês do período, do mais antigo ao mais novo. */
export type MonthEntries = { mes: MonthKey; entries: MonthEntry[] }[];

export const PERIODOS = [3, 6, 12] as const;
export type Periodo = (typeof PERIODOS)[number];

export function parsePeriodo(value: string | undefined): Periodo {
  const n = Number(value);
  return (PERIODOS as readonly number[]).includes(n) ? (n as Periodo) : 6;
}

/** Os `n` meses que terminam em `fim`, mais antigo primeiro. */
export function periodMonths(fim: MonthKey, n: number): MonthKey[] {
  return Array.from({ length: n }, (_, i) => addMonths(fim, i - (n - 1)));
}

/** Um item por mês do período; mês sem dados fica com lista vazia. */
export function fillMonths(meses: MonthKey[], dados: Map<MonthKey, MonthEntry[]>): MonthEntries {
  return meses.map((mes) => ({ mes, entries: dados.get(mes) ?? [] }));
}
