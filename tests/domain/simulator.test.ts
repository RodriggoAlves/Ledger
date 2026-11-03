import { describe, expect, test } from "vitest";
import { dailyFactor } from "@/domain/investments";
import { simulate } from "@/domain/simulator";

const rates = { cdiAnual: 1490, percentual: 10000 };

describe("simulate", () => {
  test("valor inicial por 12 meses", () => {
    const r = simulate({ inicial: 100000, aporteMensal: 0, meses: 12, ...rates });
    const bruto = 100000 * dailyFactor(rates) ** 252;
    expect(r.bruto).toBe(Math.round(bruto));
    expect(r.aportado).toBe(100000);
    expect(r.rendimento).toBe(Math.round(bruto) - 100000);
    expect(r.ir).toBe(Math.round((bruto - 100000) * 0.175));
    expect(r.liquido).toBe(r.bruto - r.ir);
    expect(r.linhas).toHaveLength(13);
  });

  test("aportes mensais entram no fim de cada mês", () => {
    const r = simulate({ inicial: 100000, aporteMensal: 10000, meses: 2, ...rates });
    expect(r.aportado).toBe(120000);
    expect(r.linhas.map((l) => l.mes)).toEqual([0, 1, 2]);
    expect(r.linhas[0]).toEqual({ mes: 0, aportado: 100000, bruto: 100000 });
    expect(r.linhas[2].aportado).toBe(120000);
  });

  test("taxa zero não rende nem paga IR", () => {
    const r = simulate({ inicial: 0, aporteMensal: 5000, meses: 3, cdiAnual: 0, percentual: 10000 });
    expect(r).toMatchObject({ aportado: 15000, bruto: 15000, rendimento: 0, ir: 0, liquido: 15000 });
  });
});
