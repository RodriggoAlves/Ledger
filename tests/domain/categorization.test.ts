import { describe, expect, test } from "vitest";
import {
  matchPurchaseCategory,
  matchRule,
  newRuleTargets,
  normalize,
  ruleInputError,
  ruleTipoAfterCategoryMove,
  type Rule,
} from "@/domain/categorization";
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from "@/domain/defaults";
import type { TxType } from "@/domain/picpay-parser";

const rules: Rule[] = [
  { padrao: "99", categoryId: "transp", tipo: "GASTO" },
  { padrao: "99 FOOD", categoryId: "alim", tipo: "GASTO" },
  { padrao: "uber", categoryId: "transp", tipo: "GASTO" },
];
const gasto = (descricao: string) => ({ descricao, valor: -100, tipo: "GASTO" as TxType });
const cat = (descricao: string, rs: Rule[] = rules) => matchRule(gasto(descricao), rs)?.categoryId ?? null;

describe("matchRule", () => {
  test("longest matching rule wins", () => {
    expect(cat("99 FOOD LTDA.")).toBe("alim");
    expect(cat("99 TECNOLOGIA")).toBe("transp");
  });

  test("is case and accent insensitive", () => {
    expect(cat("Uber *Trip")).toBe("transp");
    expect(cat("Úber")).toBe("transp");
  });

  test("returns null when nothing matches", () => {
    expect(cat("Padaria")).toBeNull();
    expect(cat("Padaria", [])).toBeNull();
  });

  const gesner: Rule = { padrao: "GESNER", categoryId: "alim", tipo: "ESTORNO" };
  const eu: Rule = { padrao: "RODRIGGO ALVES AREBA", categoryId: "transf", tipo: "MOVIMENTACAO" };

  test("regra de estorno só casa com dinheiro que entra (Review Focus 1)", () => {
    expect(matchRule({ descricao: "Gesner Borges", valor: 5000, tipo: "RECEITA" }, [gesner])).toBe(gesner);
    expect(matchRule({ descricao: "Gesner Borges", valor: -5000, tipo: "GASTO" }, [gesner])).toBeNull();
  });

  test("regra de gasto não casa com dinheiro que entra", () => {
    expect(matchRule({ descricao: "UBER REEMBOLSO", valor: 100, tipo: "RECEITA" }, rules)).toBeNull();
  });

  test("movimentação casa nos dois sentidos", () => {
    expect(matchRule({ descricao: "RODRIGGO ALVES AREBA", valor: 300000, tipo: "RECEITA" }, [eu])).toBe(eu);
    expect(matchRule({ descricao: "RODRIGGO ALVES AREBA", valor: -200000, tipo: "GASTO" }, [eu])).toBe(eu);
  });

  test("linha estorno/movimentação do parser só aceita regra do mesmo tipo", () => {
    const receita: Rule = { padrao: "SAMUEL", categoryId: "terc", tipo: "RECEITA" };
    expect(matchRule({ descricao: "Samuel", valor: 3500, tipo: "ESTORNO" }, [receita])).toBeNull();
    const estorno: Rule = { ...receita, tipo: "ESTORNO", categoryId: "alim" };
    expect(matchRule({ descricao: "Samuel", valor: 3500, tipo: "ESTORNO" }, [estorno])).toBe(estorno);
    const cofrinho: Rule = { ...eu, padrao: "COFRINHO", tipo: "GASTO" };
    expect(matchRule({ descricao: "Cofrinho X", valor: -100, tipo: "MOVIMENTACAO" }, [cofrinho])).toBeNull();
  });

  test("o mais longo vence só entre as compatíveis", () => {
    const longa: Rule = { padrao: "GESNER BORGES", categoryId: "lazer", tipo: "GASTO" };
    expect(matchRule({ descricao: "Gesner Borges", valor: 5000, tipo: "RECEITA" }, [gesner, longa])).toBe(gesner);
  });
});

test("normalize", () => {
  expect(normalize(" São Paulo ")).toBe("SAO PAULO");
});

test("default rules reference existing default categories", () => {
  const names = new Set(DEFAULT_CATEGORIES.map((c) => c.nome));
  expect(DEFAULT_CATEGORIES).toHaveLength(15);
  expect(DEFAULT_RULES).toHaveLength(10);
  for (const r of DEFAULT_RULES) expect(names.has(r.categoria)).toBe(true);
});

describe("newRuleTargets", () => {
  // No PicPay a descrição é o nome da outra pessoa: o mesmo nome aparece em Pix enviado e recebido.
  const rows: { id: string; descricao: string; valor: number; tipo: TxType }[] = [
    { id: "g1", descricao: "MARIA SILVA", valor: -100, tipo: "GASTO" },
    { id: "r1", descricao: "MARIA SILVA", valor: 100, tipo: "RECEITA" },
    { id: "g2", descricao: "JOAO SOUZA", valor: -100, tipo: "GASTO" },
  ];

  test("an expense rule reaches only matching expenses", () => {
    expect(newRuleTargets(rows, { padrao: "MARIA SILVA", categoryId: "lazer", tipo: "GASTO" })).toEqual(["g1"]);
  });

  test("an income rule leaves expenses with the same name alone", () => {
    expect(newRuleTargets(rows, { padrao: "MARIA SILVA", categoryId: "reemb", tipo: "RECEITA" })).toEqual(["r1"]);
  });

  test("a refund rule reaches only money coming in", () => {
    expect(newRuleTargets(rows, { padrao: "MARIA SILVA", categoryId: "alim", tipo: "ESTORNO" })).toEqual(["r1"]);
  });

  test("regra de movimentação pega os dois sentidos (Review Focus 2)", () => {
    expect(newRuleTargets(rows, { padrao: "MARIA SILVA", categoryId: "transf", tipo: "MOVIMENTACAO" })).toEqual(["g1", "r1"]);
  });
});

describe("matchPurchaseCategory", () => {
  test("ignora regras que não são de gasto (Review Focus 4)", () => {
    const gesner: Rule = { padrao: "GESNER", categoryId: "alim", tipo: "ESTORNO" };
    expect(matchPurchaseCategory("GESNER LTDA", [gesner])).toBeNull();
    expect(matchPurchaseCategory("GESNER LTDA", [gesner, { padrao: "GESNER", categoryId: "compras", tipo: "GASTO" }])).toBe("compras");
  });

  test("o mais longo vence", () => {
    expect(matchPurchaseCategory("99 FOOD LTDA.", rules)).toBe("alim");
  });
});

describe("ruleInputError", () => {
  test("valida tipo, categoria e compatibilidade", () => {
    expect(ruleInputError("XYZ", { tipo: "GASTO" })).toBe("Tipo inválido");
    expect(ruleInputError("ESTORNO", undefined)).toBe("Escolha uma categoria");
    expect(ruleInputError("ESTORNO", { tipo: "RECEITA" })).toBe("A categoria não combina com o tipo");
    expect(ruleInputError("ESTORNO", { tipo: "GASTO" })).toBeNull();
    expect(ruleInputError("MOVIMENTACAO", { tipo: "MOVIMENTACAO" })).toBeNull();
  });
});

describe("ruleTipoAfterCategoryMove", () => {
  test("regra que não combina com o novo tipo da categoria assume esse tipo", () => {
    expect(ruleTipoAfterCategoryMove("RECEITA", "GASTO")).toBe("GASTO");
    expect(ruleTipoAfterCategoryMove("GASTO", "MOVIMENTACAO")).toBe("MOVIMENTACAO");
  });

  test("regra de estorno continua estorno quando a categoria vira gasto", () => {
    expect(ruleTipoAfterCategoryMove("ESTORNO", "GASTO")).toBe("ESTORNO");
  });

  test("regra de estorno vira o novo tipo quando a categoria deixa de ser gasto", () => {
    expect(ruleTipoAfterCategoryMove("ESTORNO", "RECEITA")).toBe("RECEITA");
  });
});
