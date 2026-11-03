import { buildLots, position, type Movement, type Rates, type Snapshot } from "../investments";
import { monthKey, monthRange, type MonthKey } from "../month";

type Investimento = { movs: Movement[]; snaps: Snapshot[]; rates: Rates };

/** Aportes − resgates por mês. */
export function cofrinhoByMonth(movs: Movement[]): Map<MonthKey, number> {
  const out = new Map<MonthKey, number>();
  for (const m of movs) out.set(monthKey(m.data), (out.get(monthKey(m.data)) ?? 0) + m.valor);
  return out;
}

const DAY = 86_400_000;
const saldoEm = (invs: Investimento[], em: Date) =>
  invs.reduce((s, i) => s + position(buildLots(i.movs, i.snaps, i.rates, em), em).bruto, 0);

/**
 * Cofrinhos no período: por mês, aportes, resgates e saldo estimado no último dia (ou hoje, se antes).
 * Rendimento = saldo final − saldo antes do período − movimentos líquidos do período.
 */
export function investmentsInPeriod(i: { meses: MonthKey[]; investimentos: Investimento[]; hoje: Date }): {
  linhas: { mes: MonthKey; aportes: number; resgates: number; saldo: number }[];
  saldoHoje: number;
  rendimento: number;
  aportado: number;
} {
  const movs = i.investimentos.flatMap((inv) => inv.movs);
  const linhas = i.meses.map((mes) => {
    const [start, end] = monthRange(mes);
    const ultimoDia = new Date(Math.min(end.getTime() - DAY, i.hoje.getTime()));
    const doMes = movs.filter((m) => m.data >= start && m.data < end);
    return {
      mes,
      aportes: doMes.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0),
      resgates: doMes.filter((m) => m.valor < 0).reduce((s, m) => s - m.valor, 0),
      saldo: start > i.hoje ? saldoEm(i.investimentos, i.hoje) : saldoEm(i.investimentos, ultimoDia),
    };
  });
  const antes = i.meses.length ? saldoEm(i.investimentos, new Date(monthRange(i.meses[0])[0].getTime() - DAY)) : 0;
  const aportado = linhas.reduce((s, l) => s + l.aportes - l.resgates, 0);
  const final = linhas.length ? linhas[linhas.length - 1].saldo : 0;
  return { linhas, saldoHoje: saldoEm(i.investimentos, i.hoje), rendimento: final - antes - aportado, aportado };
}
