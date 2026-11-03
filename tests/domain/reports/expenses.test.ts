import { describe, expect, test } from "vitest";
import { normalizeMerchant, topExpenses, topMerchants } from "@/domain/reports/expenses";
import { cartao, conta } from "./helpers";

describe("topExpenses", () => {
  test("maiores gastos do período, só GASTO", () => {
    const a = conta(-100);
    const b = cartao(-900);
    const c = conta(-500);
    const r = topExpenses(
      [
        { mes: "2026-10", entries: [a, b, conta(5000), conta(-7000, { tipo: "MOVIMENTACAO" })] },
        { mes: "2026-11", entries: [c] },
      ],
      2,
    );
    expect(r).toEqual([b, c]);
  });
});

describe("normalizeMerchant", () => {
  test("maiúsculas, espaços e sufixo de parcela", () => {
    expect(normalizeMerchant("  Uber   *Trip 2/10 ")).toBe("UBER *TRIP");
  });
});

describe("topMerchants", () => {
  test("agrupa pela descrição normalizada", () => {
    const r = topMerchants(
      [
        { mes: "2026-10", entries: [conta(-100, { descricao: "Uber *Trip" }), cartao(-50, { descricao: "UBER  *TRIP 1/2" })] },
        { mes: "2026-11", entries: [conta(-120, { descricao: "Mercado" }), conta(30, { tipo: "GASTO", descricao: "uber *trip" })] },
      ],
      10,
    );
    expect(r).toEqual([
      { nome: "Uber *Trip", total: 120, vezes: 3 },
      { nome: "Mercado", total: 120, vezes: 1 },
    ]);
  });

  test("limita a n", () => {
    const r = topMerchants([{ mes: "2026-10", entries: [conta(-1, { descricao: "A" }), conta(-2, { descricao: "B" })] }], 1);
    expect(r.map((m) => m.nome)).toEqual(["B"]);
  });
});
