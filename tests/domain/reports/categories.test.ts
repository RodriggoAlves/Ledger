import { describe, expect, test } from "vitest";
import { categoriesInPeriod } from "@/domain/reports/categories";
import { cartao, cats, conta } from "./helpers";

describe("categoriesInPeriod", () => {
  const meses = [
    { mes: "2026-09", entries: [conta(-100, { categoryId: "alim" }), conta(-50, { categoryId: "transp" })] },
    { mes: "2026-10", entries: [cartao(-200, { categoryId: "alim" }), conta(-10)] },
    { mes: "2026-11", entries: [conta(-600, { categoryId: "alim" }), conta(50, { tipo: "GASTO", categoryId: "transp" })] },
  ];

  test("total, média, último mês e variação", () => {
    const [alim] = categoriesInPeriod(meses, cats, "GASTO");
    expect(alim).toEqual({
      categoryId: "alim",
      nome: "Alimentação",
      cor: "#f00",
      total: 900,
      media: 300,
      ultimo: 600,
      variacao: 300,
      serie: [100, 200, 600],
    });
  });

  test("categoria com total ≤ 0 some; sem categoria tem nome próprio", () => {
    const r = categoriesInPeriod(meses, cats, "GASTO");
    expect(r.map((c) => c.nome)).toEqual(["Alimentação", "Sem categoria"]);
    expect(r[1]).toMatchObject({ categoryId: null, total: 10, ultimo: 0, variacao: -100 });
  });

  test("um mês só não tem variação", () => {
    expect(categoriesInPeriod([meses[0]], cats, "GASTO")[0].variacao).toBeNull();
  });

  test("sem base anterior não tem variação", () => {
    const r = categoriesInPeriod([{ mes: "2026-10", entries: [] }, { mes: "2026-11", entries: [conta(-5, { categoryId: "alim" })] }], cats, "GASTO");
    expect(r[0].variacao).toBeNull();
  });

  test("receitas somam entradas RECEITA", () => {
    const r = categoriesInPeriod(
      [{ mes: "2026-10", entries: [conta(5000, { categoryId: "sal" }), conta(-100, { categoryId: "alim" }), conta(300, { tipo: "MOVIMENTACAO" })] }],
      cats,
      "RECEITA",
    );
    expect(r).toEqual([expect.objectContaining({ nome: "Salário", total: 5000 })]);
  });
});

describe("estornos por categoria", () => {
  const meses = [{ mes: "2026-10" as const, entries: [conta(-8000, { categoryId: "alim" }), conta(5000, { tipo: "ESTORNO", categoryId: "alim" })] }];

  test("estorno abate da categoria de gasto", () => {
    expect(categoriesInPeriod(meses, cats, "GASTO").map((c) => [c.categoryId, c.total])).toEqual([["alim", 3000]]);
  });

  test("estorno não aparece nas receitas", () => {
    expect(categoriesInPeriod(meses, cats, "RECEITA")).toEqual([]);
  });
});
