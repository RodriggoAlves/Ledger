import { describe, expect, test } from "vitest";
import { installmentsAsTxs, summarizeByCategory } from "@/domain/summary";
import type { TxType } from "@/domain/picpay-parser";

const cats = [
  { id: "alim", nome: "Alimentação", cor: "#f00" },
  { id: "transp", nome: "Transporte", cor: "#00f" },
];
const tx = (valor: number, categoryId: string | null, tipo: TxType = "GASTO", convertidaCredito = false) => ({
  valor,
  categoryId,
  tipo,
  convertidaCredito,
});

describe("summarizeByCategory", () => {
  test("sums only GASTO not converted to credit", () => {
    const r = summarizeByCategory(
      [tx(-1000, "alim"), tx(5000, "alim", "RECEITA"), tx(-9000, "alim", "MOVIMENTACAO"), tx(-700, "alim", "GASTO", true)],
      cats,
    );
    expect(r).toEqual([{ categoryId: "alim", nome: "Alimentação", cor: "#f00", total: 1000, percentual: 100 }]);
  });

  test("groups uncategorized and orders by total desc", () => {
    const r = summarizeByCategory([tx(-100, "alim"), tx(-300, null), tx(-200, "transp"), tx(-100, "transp")], cats);
    expect(r.map((c) => [c.nome, c.total])).toEqual([
      ["Sem categoria", 300],
      ["Transporte", 300],
      ["Alimentação", 100],
    ]);
    expect(r[0].categoryId).toBeNull();
  });

  test("percentages sum to ~100", () => {
    const r = summarizeByCategory([tx(-100, "alim"), tx(-100, "transp"), tx(-100, null)], cats);
    const sum = r.reduce((s, c) => s + c.percentual, 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.1);
  });

  test("positive-valued GASTO (estorno) reduces total and never goes negative", () => {
    const r = summarizeByCategory([tx(-1000, "alim"), tx(300, "alim")], cats);
    expect(r[0].total).toBe(700);
    expect(summarizeByCategory([tx(300, "alim")], cats)).toEqual([]);
  });

  test("empty input", () => {
    expect(summarizeByCategory([], cats)).toEqual([]);
  });
});

test("counts credit installments and skips the converted transaction", () => {
  const txs = [tx(-9000, "alim", "GASTO", true), ...installmentsAsTxs([{ valor: 3000, categoryId: "alim" }])];
  expect(summarizeByCategory(txs, cats)).toEqual([
    { categoryId: "alim", nome: "Alimentação", cor: "#f00", total: 3000, percentual: 100 },
  ]);
});
