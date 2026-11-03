/**
 * Rendimento de investimentos atrelados ao CDI (cofrinhos do PicPay).
 * Valores em centavos; taxas em centésimos de % (1490 = 14,90%; 10000 = 100% do CDI).
 * Contas em ponto flutuante; arredondamento só em `position`.
 */

/** Aporte (+) ou resgate (−) no cofrinho. */
export type Movement = { data: Date; valor: number };
/** Saldo real informado pelo usuário no dia `data`. */
export type Snapshot = { data: Date; saldo: number };
export type Rates = { cdiAnual: number; percentual: number };
/** Parte do saldo com idade própria (para o IR regressivo). */
export type Lot = { data: Date; principal: number; valor: number };
export type Position = { bruto: number; principal: number; rendimento: number; ir: number; liquido: number };

const DAY = 86_400_000;
/** Dias úteis num mês de projeção. */
export const DIAS_UTEIS_MES = 21;

const dayOf = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Fator de um dia útil: a % do CDI incide sobre a taxa diária do CDI. */
export function dailyFactor(r: Rates): number {
  return 1 + ((1 + r.cdiAnual / 10000) ** (1 / 252) - 1) * (r.percentual / 10000);
}

/** Dias de segunda a sexta em (a, b]; feriados ignorados. */
export function businessDaysBetween(a: Date, b: Date): number {
  const start = dayOf(a);
  const end = dayOf(b);
  if (end <= start) return 0;
  const total = Math.round((end - start) / DAY);
  const weeks = Math.floor(total / 7);
  let count = weeks * 5;
  for (let t = start + weeks * 7 * DAY + DAY; t <= end; t += DAY) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) count++;
  }
  return count;
}

/** Alíquota do IR regressivo pela idade da aplicação, em dias corridos. */
export function irRate(dias: number): number {
  if (dias <= 180) return 0.225;
  if (dias <= 360) return 0.2;
  if (dias <= 720) return 0.175;
  return 0.15;
}

function grow(lots: Lot[], factor: number, days: number) {
  if (days <= 0) return;
  const f = factor ** days;
  for (const l of lots) l.valor *= f;
}

/** Resgate do lote mais antigo para o mais novo; o principal cai na proporção do valor retirado. */
function withdraw(lots: Lot[], amount: number): Lot[] {
  let rest = amount;
  for (const l of lots) {
    if (rest <= 0) break;
    const take = Math.min(l.valor, rest);
    l.principal *= l.valor > 0 ? (l.valor - take) / l.valor : 0;
    l.valor -= take;
    rest -= take;
  }
  return lots.filter((l) => l.valor > 1e-9);
}

/**
 * Lotes do investimento em `ate`: aplica movimentos e saldos reais em ordem e rende por dia útil.
 * No mesmo dia, movimentos vêm antes do saldo informado (o saldo já os inclui).
 * Saldo real > 0 escala valor e principal de todos os lotes; sem lotes, vira um lote novo.
 */
export function buildLots(movs: Movement[], snaps: Snapshot[], r: Rates, ate: Date): Lot[] {
  const limite = dayOf(ate);
  const events = [
    ...movs.map((m) => ({ dia: dayOf(m.data), kind: 0, valor: m.valor })),
    ...snaps.map((s) => ({ dia: dayOf(s.data), kind: 1, valor: s.saldo })),
  ]
    .filter((e) => e.dia <= limite)
    .sort((a, b) => a.dia - b.dia || a.kind - b.kind);

  const factor = dailyFactor(r);
  let lots: Lot[] = [];
  let cursor: number | null = null;
  const advance = (to: number) => {
    if (cursor !== null && to > cursor) grow(lots, factor, businessDaysBetween(new Date(cursor), new Date(to)));
    if (cursor === null || to > cursor) cursor = to;
  };

  for (const e of events) {
    advance(e.dia);
    if (e.kind === 0) {
      if (e.valor > 0) lots.push({ data: new Date(e.dia), principal: e.valor, valor: e.valor });
      else if (e.valor < 0) lots = withdraw(lots, -e.valor);
    } else {
      const est = lots.reduce((s, l) => s + l.valor, 0);
      if (est > 1e-9) {
        const k = e.valor / est;
        for (const l of lots) {
          l.valor *= k;
          l.principal *= k;
        }
        lots = lots.filter((l) => l.valor > 1e-9);
      } else if (e.valor > 0) {
        lots = [{ data: new Date(e.dia), principal: e.valor, valor: e.valor }];
      }
    }
  }
  advance(dayOf(ate));
  return lots;
}

/** Posição em `em`: bruto, principal, rendimento, IR estimado e líquido (centavos). */
export function position(lots: Lot[], em: Date): Position {
  let bruto = 0;
  let principal = 0;
  let ir = 0;
  for (const l of lots) {
    bruto += l.valor;
    principal += l.principal;
    const dias = Math.round((dayOf(em) - dayOf(l.data)) / DAY);
    ir += Math.max(0, l.valor - l.principal) * irRate(dias);
  }
  const b = Math.round(bruto);
  const p = Math.round(principal);
  const i = Math.round(ir);
  return { bruto: b, principal: p, rendimento: b - p, ir: i, liquido: b - i };
}

function addCalendarMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
}

/** Posição daqui a `meses` meses (21 dias úteis por mês), sem novos aportes. */
export function project(lots: Lot[], em: Date, meses: number, r: Rates): Position {
  const copy = lots.map((l) => ({ ...l }));
  grow(copy, dailyFactor(r), DIAS_UTEIS_MES * meses);
  return position(copy, addCalendarMonths(em, meses));
}

export type SnapshotComparison = {
  de: Date;
  ate: Date;
  saldoInicial: number;
  saldoFinal: number;
  /** Aportes − resgates no intervalo. */
  movimentos: number;
  rendimentoReal: number;
  rendimentoEsperado: number;
  /** % do CDI efetivo (centésimos de %), proporcional ao esperado. */
  taxaEfetiva: number | null;
};

/** Rendimento real × esperado entre cada par de saldos informados consecutivos. */
export function compareSnapshots(movs: Movement[], snaps: Snapshot[], r: Rates): SnapshotComparison[] {
  const sorted = [...snaps].sort((a, b) => a.data.getTime() - b.data.getTime());
  const out: SnapshotComparison[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    const between = movs.filter((m) => dayOf(m.data) > dayOf(a.data) && dayOf(m.data) <= dayOf(b.data));
    const movimentos = between.reduce((s, m) => s + m.valor, 0);
    const esperado = position(buildLots(between, [a], r, b.data), b.data).bruto;
    const rendimentoReal = b.saldo - a.saldo - movimentos;
    const rendimentoEsperado = esperado - a.saldo - movimentos;
    out.push({
      de: a.data,
      ate: b.data,
      saldoInicial: a.saldo,
      saldoFinal: b.saldo,
      movimentos,
      rendimentoReal,
      rendimentoEsperado,
      taxaEfetiva: rendimentoEsperado > 0 ? Math.round((r.percentual * rendimentoReal) / rendimentoEsperado) : null,
    });
  }
  return out;
}
