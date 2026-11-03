import { DIAS_UTEIS_MES, dailyFactor, irRate } from "./investments";

export type SimulationInput = {
  /** Centavos. */
  inicial: number;
  aporteMensal: number;
  meses: number;
  /** Centésimos de %. */
  cdiAnual: number;
  percentual: number;
};

export type SimulationResult = {
  /** Mês 0 = só o valor inicial. */
  linhas: { mes: number; aportado: number; bruto: number }[];
  aportado: number;
  bruto: number;
  rendimento: number;
  ir: number;
  liquido: number;
};

export const MAX_MESES = 600;

/**
 * Projeção com aporte mensal: o inicial entra no mês 0 e cada aporte no fim de cada mês.
 * Cada mês rende 21 dias úteis; o IR usa a idade de cada aporte em meses de calendário (12 meses = 365 dias).
 */
export function simulate(i: SimulationInput): SimulationResult {
  const fMes = dailyFactor(i) ** DIAS_UTEIS_MES;
  const lots: { mes: number; principal: number; valor: number }[] = i.inicial > 0 ? [{ mes: 0, principal: i.inicial, valor: i.inicial }] : [];
  let aportado = i.inicial;
  const sum = () => lots.reduce((s, l) => s + l.valor, 0);
  const linhas = [{ mes: 0, aportado, bruto: Math.round(sum()) }];

  for (let m = 1; m <= i.meses; m++) {
    for (const l of lots) l.valor *= fMes;
    if (i.aporteMensal > 0) {
      lots.push({ mes: m, principal: i.aporteMensal, valor: i.aporteMensal });
      aportado += i.aporteMensal;
    }
    linhas.push({ mes: m, aportado, bruto: Math.round(sum()) });
  }

  const bruto = Math.round(sum());
  const ir = Math.round(
    lots.reduce((s, l) => s + Math.max(0, l.valor - l.principal) * irRate(Math.round(((i.meses - l.mes) * 365.25) / 12)), 0),
  );
  return { linhas, aportado, bruto, rendimento: bruto - aportado, ir, liquido: bruto - ir };
}
