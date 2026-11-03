import { describe, expect, test } from "vitest";
import {
  buildLots,
  businessDaysBetween,
  compareSnapshots,
  dailyFactor,
  irRate,
  position,
  project,
  type Rates,
} from "@/domain/investments";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const CDI: Rates = { cdiAnual: 1490, percentual: 10000 };
const ZERO: Rates = { cdiAnual: 0, percentual: 10000 };

describe("dailyFactor", () => {
  test("252 dias úteis a 100% do CDI dão o CDI anual", () => {
    expect(dailyFactor(CDI) ** 252).toBeCloseTo(1.149, 6);
  });

  test("200% do CDI dobra a taxa diária", () => {
    const base = dailyFactor(CDI) - 1;
    expect(dailyFactor({ cdiAnual: 1490, percentual: 20000 }) - 1).toBeCloseTo(base * 2, 12);
  });
});

describe("businessDaysBetween", () => {
  test("sexta → segunda é 1 dia útil", () => {
    expect(businessDaysBetween(d("2026-10-30"), d("2026-11-02"))).toBe(1);
  });

  test("mesmo dia ou datas invertidas dão 0", () => {
    expect(businessDaysBetween(d("2026-11-02"), d("2026-11-02"))).toBe(0);
    expect(businessDaysBetween(d("2026-11-05"), d("2026-11-02"))).toBe(0);
  });

  test("uma semana cheia tem 5", () => {
    expect(businessDaysBetween(d("2026-11-01"), d("2026-11-08"))).toBe(5);
  });
});

describe("irRate", () => {
  test("faixas do IR regressivo", () => {
    expect(irRate(180)).toBe(0.225);
    expect(irRate(181)).toBe(0.2);
    expect(irRate(360)).toBe(0.2);
    expect(irRate(361)).toBe(0.175);
    expect(irRate(720)).toBe(0.175);
    expect(irRate(721)).toBe(0.15);
  });
});

describe("buildLots", () => {
  test("aporte no mesmo dia não rende", () => {
    const lots = buildLots([{ data: d("2026-11-02"), valor: 100000 }], [], CDI, d("2026-11-02"));
    expect(position(lots, d("2026-11-02")).bruto).toBe(100000);
  });

  test("rende por dia útil", () => {
    // 02/11 (seg) → 30/11 (seg): 20 dias úteis.
    const lots = buildLots([{ data: d("2026-11-02"), valor: 100000 }], [], CDI, d("2026-11-30"));
    expect(position(lots, d("2026-11-30")).bruto).toBe(Math.round(100000 * dailyFactor(CDI) ** 20));
  });

  test("resgate consome o lote mais antigo primeiro", () => {
    const lots = buildLots(
      [
        { data: d("2026-01-05"), valor: 1000 },
        { data: d("2026-03-05"), valor: 1000 },
        { data: d("2026-03-05"), valor: -1500 },
      ],
      [],
      ZERO,
      d("2026-03-05"),
    );
    expect(lots).toHaveLength(1);
    expect(lots[0].data).toEqual(d("2026-03-05"));
    expect(lots[0].principal).toBeCloseTo(500);
    expect(lots[0].valor).toBeCloseTo(500);
  });

  test("resgate beyond balance floors at zero", () => {
    const lots = buildLots([{ data: d("2026-03-05"), valor: -500 }], [], CDI, d("2026-04-05"));
    expect(lots.every((l) => l.valor >= 0)).toBe(true);
    expect(position(lots, d("2026-04-05")).bruto).toBe(0);
  });

  test("snapshot without movements creates lot", () => {
    const lots = buildLots([], [{ data: d("2026-10-01"), saldo: 50000 }], CDI, d("2026-10-01"));
    expect(lots).toEqual([{ data: d("2026-10-01"), principal: 50000, valor: 50000 }]);
  });

  test("saldo real escala valor e principal", () => {
    const lots = buildLots([{ data: d("2026-10-01"), valor: 1000 }], [{ data: d("2026-10-01"), saldo: 1100 }], ZERO, d("2026-10-01"));
    const p = position(lots, d("2026-10-01"));
    expect(p.bruto).toBe(1100);
    expect(p.principal).toBe(1100);
  });

  test("movimento no mesmo dia do saldo conta antes dele", () => {
    const lots = buildLots([{ data: d("2026-10-01"), valor: 1000 }], [{ data: d("2026-10-01"), saldo: 1000 }], CDI, d("2026-10-01"));
    expect(position(lots, d("2026-10-01")).bruto).toBe(1000);
  });

  test("ignora movimentos e saldos depois de `ate`", () => {
    const lots = buildLots(
      [
        { data: d("2026-10-01"), valor: 1000 },
        { data: d("2026-11-01"), valor: 5000 },
      ],
      [{ data: d("2026-11-02"), saldo: 99999 }],
      ZERO,
      d("2026-10-31"),
    );
    expect(position(lots, d("2026-10-31")).bruto).toBe(1000);
  });

  test("saldo real zero zera os lotes", () => {
    const lots = buildLots([{ data: d("2026-10-01"), valor: 1000 }], [{ data: d("2026-10-02"), saldo: 0 }], CDI, d("2026-10-10"));
    expect(position(lots, d("2026-10-10")).bruto).toBe(0);
  });
});

describe("position", () => {
  test("IR sobre o rendimento pela idade do lote", () => {
    const p = position([{ data: d("2026-01-01"), principal: 10000, valor: 11000 }], d("2026-04-11"));
    expect(p).toEqual({ bruto: 11000, principal: 10000, rendimento: 1000, ir: 225, liquido: 10775 });
  });

  test("sem lotes tudo é zero", () => {
    expect(position([], d("2026-01-01"))).toEqual({ bruto: 0, principal: 0, rendimento: 0, ir: 0, liquido: 0 });
  });
});

describe("project", () => {
  test("12 meses = 252 dias úteis e IR de 17,5%", () => {
    const hoje = d("2026-11-03");
    const lots = buildLots([{ data: hoje, valor: 100000 }], [], CDI, hoje);
    const p = project(lots, hoje, 12, CDI);
    const bruto = Math.round(100000 * dailyFactor(CDI) ** 252);
    expect(p.bruto).toBe(bruto);
    expect(p.ir).toBe(Math.round((100000 * dailyFactor(CDI) ** 252 - 100000) * 0.175));
  });

  test("não altera os lotes originais", () => {
    const hoje = d("2026-11-03");
    const lots = buildLots([{ data: hoje, valor: 100000 }], [], CDI, hoje);
    project(lots, hoje, 6, CDI);
    expect(lots[0].valor).toBe(100000);
  });
});

describe("compareSnapshots", () => {
  test("rendimento real desconta os movimentos", () => {
    const [c] = compareSnapshots(
      [{ data: d("2026-10-15"), valor: 1000 }],
      [
        { data: d("2026-10-01"), saldo: 100000 },
        { data: d("2026-11-01"), saldo: 101500 },
      ],
      CDI,
    );
    expect(c.movimentos).toBe(1000);
    expect(c.rendimentoReal).toBe(500);
    expect(c.rendimentoEsperado).toBeGreaterThan(0);
    expect(c.taxaEfetiva).toBe(Math.round((10000 * 500) / c.rendimentoEsperado));
  });

  test("movimento no dia do primeiro saldo fica fora do intervalo", () => {
    const [c] = compareSnapshots(
      [{ data: d("2026-10-01"), valor: 1000 }],
      [
        { data: d("2026-10-01"), saldo: 1000 },
        { data: d("2026-10-02"), saldo: 1000 },
      ],
      ZERO,
    );
    expect(c.movimentos).toBe(0);
    expect(c.rendimentoReal).toBe(0);
    expect(c.taxaEfetiva).toBeNull();
  });

  test("menos de dois saldos não compara", () => {
    expect(compareSnapshots([], [{ data: d("2026-10-01"), saldo: 1 }], CDI)).toEqual([]);
  });
});
