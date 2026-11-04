import { describe, expect, test } from "vitest";
import { buildMonthEntries, entriesTotal, filterEntries, type CardRow } from "@/domain/entries";
import { summarizeSpending } from "@/domain/summary";
import type { TxType } from "@/domain/picpay-parser";

const cats = [
  { id: "alim", nome: "Alimentação", cor: "#f00" },
  { id: "transp", nome: "Transporte", cor: "#00f" },
];
const tx = (valor: number, categoryId: string | null, tipo: TxType = "GASTO") => ({ valor, categoryId, tipo });

describe("summarizeSpending", () => {
  test("sums only GASTO", () => {
    const r = summarizeSpending([tx(-1000, "alim"), tx(5000, "alim", "RECEITA"), tx(-9000, "alim", "MOVIMENTACAO")], cats);
    expect(r).toEqual({
      categorias: [{ categoryId: "alim", nome: "Alimentação", cor: "#f00", total: 1000, percentual: 100 }],
      creditos: 0,
      total: 1000,
    });
  });

  test("groups uncategorized and orders by total desc", () => {
    const r = summarizeSpending([tx(-100, "alim"), tx(-300, null), tx(-200, "transp"), tx(-100, "transp")], cats);
    expect(r.categorias.map((c) => [c.nome, c.total])).toEqual([
      ["Sem categoria", 300],
      ["Transporte", 300],
      ["Alimentação", 100],
    ]);
    expect(r.categorias[0].categoryId).toBeNull();
  });

  test("percentages sum to ~100", () => {
    const r = summarizeSpending([tx(-100, "alim"), tx(-100, "transp"), tx(-100, null)], cats);
    const sum = r.categorias.reduce((s, c) => s + c.percentual, 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.1);
  });

  test("a refund reduces its category", () => {
    const r = summarizeSpending([tx(-1000, "alim"), tx(300, "alim")], cats);
    expect(r.categorias[0].total).toBe(700);
    expect(r.creditos).toBe(0);
    expect(r.total).toBe(700);
  });

  test("a category left negative becomes a credit that reduces the total", () => {
    const r = summarizeSpending(
      [tx(-1000, "alim"), tx(-319900, "transp"), tx(319900, "transp"), tx(319900, "transp")],
      cats,
    );
    expect(r.categorias.map((c) => c.categoryId)).toEqual(["alim"]);
    expect(r.categorias[0].percentual).toBe(100);
    expect(r.creditos).toBe(-319900);
    expect(r.total).toBe(-318900);
  });

  test("empty input", () => {
    expect(summarizeSpending([], cats)).toEqual({ categorias: [], creditos: 0, total: 0 });
  });

  test("dashboard numbers match the filtered lists (month with 'pula compra')", () => {
    const card = (
      id: string,
      descricao: string,
      valor: number,
      categoryId: string | null,
      tipo: CardRow["tipo"],
      numero = 1,
      parcelas = 1,
    ): CardRow => ({
      installmentId: id,
      purchaseId: id,
      dataCompra: new Date("2026-09-15T00:00:00Z"),
      descricao,
      valor,
      numero,
      parcelas,
      categoryId,
      tipo,
      cancelada: false,
    });
    const entries = buildMonthEntries(
      [
        { id: "t1", dataHora: new Date("2026-09-03T12:00:00Z"), descricao: "PIX MERCADO", valor: -10000, tipo: "GASTO", categoryId: "alim", formaPagamento: "Com saldo" },
        { id: "t2", dataHora: new Date("2026-09-05T11:16:00Z"), descricao: "Fatura PicPay Card", valor: -166155, tipo: "MOVIMENTACAO", categoryId: null, formaPagamento: "Com saldo" },
        { id: "t3", dataHora: new Date("2026-09-10T09:00:00Z"), descricao: "SALARIO", valor: 500000, tipo: "RECEITA", categoryId: null, formaPagamento: null },
      ],
      [
        card("i1", "AMAZONMKTPLC*SAMSUNGEL", 319900, "transp", "COMPRA"),
        card("i2", "AMAZONMKTPLC*SAMSUNGEL", -319900, "transp", "ESTORNO"),
        card("i3", "CREDITO PULA COMPRA", -319900, "transp", "ESTORNO"),
        card("i4", "GOOGLE", 2399, null, "COMPRA"),
        card("i5", "AMAZON BR", 23088, "alim", "COMPRA", 8, 10),
      ],
    );
    const resumo = summarizeSpending(entries, cats);
    expect(resumo.creditos).toBe(-319900);
    expect(resumo.total).toBe(-entriesTotal(filterEntries(entries, { tipo: "GASTO" })));
    for (const c of resumo.categorias) {
      expect(c.total).toBe(-entriesTotal(filterEntries(entries, { tipo: "GASTO", categoryId: c.categoryId ?? "none" })));
    }
    expect(-entriesTotal(filterEntries(entries, { origem: "CARTAO" }))).toBe(319900 - 319900 - 319900 + 2399 + 23088);
  });
});

describe("estornos", () => {
  test("estorno abate da categoria", () => {
    const r = summarizeSpending([tx(-8000, "alim"), tx(5000, "alim", "ESTORNO")], cats);
    expect(r.categorias.map((c) => [c.categoryId, c.total])).toEqual([["alim", 3000]]);
    expect(r.total).toBe(3000);
  });

  test("estorno maior que os gastos vira crédito, não fatia", () => {
    const r = summarizeSpending([tx(-1000, "alim"), tx(3000, "alim", "ESTORNO"), tx(-500, "transp")], cats);
    expect(r.categorias.map((c) => [c.categoryId, c.total])).toEqual([["transp", 500]]);
    expect(r.creditos).toBe(-2000);
    expect(r.total).toBe(-1500);
  });
});
