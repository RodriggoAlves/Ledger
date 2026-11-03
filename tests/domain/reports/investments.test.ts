import { describe, expect, test } from "vitest";
import { cofrinhoByMonth, investmentsInPeriod } from "@/domain/reports/investments";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const ZERO = { cdiAnual: 0, percentual: 10000 };

describe("cofrinhoByMonth", () => {
  test("líquido por mês", () => {
    expect(
      cofrinhoByMonth([
        { data: d("2026-10-05"), valor: 1000 },
        { data: d("2026-10-20"), valor: -300 },
        { data: d("2026-11-01"), valor: 50 },
      ]),
    ).toEqual(
      new Map([
        ["2026-10", 700],
        ["2026-11", 50],
      ]),
    );
  });
});

describe("investmentsInPeriod", () => {
  test("aportes, resgates e saldo no fim de cada mês", () => {
    const r = investmentsInPeriod({
      meses: ["2026-10", "2026-11"],
      investimentos: [{ movs: [{ data: d("2026-10-05"), valor: 100000 }], snaps: [], rates: ZERO }],
      hoje: d("2026-11-03"),
    });
    expect(r.linhas).toEqual([
      { mes: "2026-10", aportes: 100000, resgates: 0, saldo: 100000 },
      { mes: "2026-11", aportes: 0, resgates: 0, saldo: 100000 },
    ]);
    expect(r).toMatchObject({ saldoHoje: 100000, rendimento: 0, aportado: 100000 });
  });

  test("rendimento desconta o saldo de antes do período e os movimentos", () => {
    const r = investmentsInPeriod({
      meses: ["2026-11"],
      investimentos: [
        {
          movs: [
            { data: d("2026-09-01"), valor: 1000 },
            { data: d("2026-11-02"), valor: -200 },
          ],
          snaps: [{ data: d("2026-11-03"), saldo: 900 }],
          rates: ZERO,
        },
      ],
      hoje: d("2026-11-03"),
    });
    expect(r.linhas).toEqual([{ mes: "2026-11", aportes: 0, resgates: 200, saldo: 900 }]);
    expect(r.rendimento).toBe(100);
    expect(r.aportado).toBe(-200);
  });

  test("mês corrente medido hoje, não no fim do mês", () => {
    const rates = { cdiAnual: 1490, percentual: 10000 };
    const movs = [{ data: d("2026-11-02"), valor: 100000 }];
    const r = investmentsInPeriod({ meses: ["2026-11"], investimentos: [{ movs, snaps: [], rates }], hoje: d("2026-11-03") });
    expect(r.linhas[0].saldo).toBe(r.saldoHoje);
  });
});
