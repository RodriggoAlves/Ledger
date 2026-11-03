import { describe, expect, test } from "vitest";
import { monthlyEvolution, originSplit } from "@/domain/reports/evolution";
import { summarizeSpending } from "@/domain/summary";
import { cartao, cats, conta } from "./helpers";

describe("monthlyEvolution", () => {
  const meses = [
    { mes: "2026-09", entries: [] },
    {
      mes: "2026-10",
      entries: [conta(500000, { categoryId: "sal" }), conta(-150000, { categoryId: "alim" }), cartao(-50000, { categoryId: "transp" })],
    },
    {
      mes: "2026-11",
      entries: [conta(100000), conta(-200000, { categoryId: "alim" }), conta(-9000, { tipo: "MOVIMENTACAO" })],
    },
  ];
  const r = monthlyEvolution(meses, cats, new Map([["2026-10", 30000]]));

  test("mês vazio fica com zeros e sem poupança", () => {
    expect(r.linhas[0]).toEqual({ mes: "2026-09", entradas: 0, gastos: 0, saldo: 0, poupanca: null, cofrinhos: 0, saldoAcumulado: 0 });
  });

  test("saldo, poupança e cofrinhos do mês", () => {
    expect(r.linhas[1]).toEqual({
      mes: "2026-10",
      entradas: 500000,
      gastos: 200000,
      saldo: 300000,
      poupanca: 60,
      cofrinhos: 30000,
      saldoAcumulado: 300000,
    });
  });

  test("movimentação não conta e saldo negativo acumula", () => {
    expect(r.linhas[2]).toMatchObject({ entradas: 100000, gastos: 200000, saldo: -100000, poupanca: -100, saldoAcumulado: 200000 });
  });

  test("totais do período", () => {
    expect(r.totais).toEqual({ entradas: 600000, gastos: 400000, saldo: 200000, poupanca: 33.3, cofrinhos: 30000 });
  });

  test("gastos usam a mesma regra do Dashboard (crédito abate)", () => {
    const entries = [conta(-1000, { categoryId: "alim" }), conta(300, { tipo: "GASTO", categoryId: "transp" })];
    const g = monthlyEvolution([{ mes: "2026-10", entries }], cats, new Map()).linhas[0].gastos;
    expect(g).toBe(summarizeSpending(entries, cats).total);
    expect(g).toBe(700);
  });
});

describe("originSplit", () => {
  test("gasto por conta e cartão", () => {
    expect(
      originSplit([{ mes: "2026-10", entries: [conta(-100), cartao(-300), cartao(50), conta(999, { tipo: "RECEITA" })] }]),
    ).toEqual([{ mes: "2026-10", conta: 100, cartao: 250 }]);
  });

  test("mês vazio dá 0, não -0", () => {
    const [r] = originSplit([{ mes: "2026-10", entries: [] }]);
    expect(Object.is(r.conta, 0) && Object.is(r.cartao, 0)).toBe(true);
  });
});
