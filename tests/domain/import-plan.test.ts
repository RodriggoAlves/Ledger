import { describe, expect, test } from "vitest";
import { buildImportPlan } from "@/domain/import-plan";
import type { Rule } from "@/domain/categorization";
import type { ParsedRow, ParseResult, TxType } from "@/domain/picpay-parser";

const row = (descricao: string, tipo: TxType, hash: string): ParsedRow => ({
  dataHora: new Date(2026, 9, 1),
  tipoOriginal: "x",
  descricao,
  valor: tipo === "RECEITA" ? 100 : -100,
  formaPagamento: null,
  tipo,
  hash,
});

const parsed: ParseResult = {
  rows: [
    row("UBER TRIP", "GASTO", "h1"),
    row("PADARIA", "GASTO", "h2"),
    row("FULANO", "RECEITA", "h3"),
    row("Cofrinho", "MOVIMENTACAO", "h4"),
    row("JA IMPORTADA", "GASTO", "h5"),
  ],
  invalid: [{ line: 9, raw: "x", reason: "Valor inválido" }],
};
const rules: Rule[] = [{ padrao: "UBER", categoryId: "transp", tipo: "GASTO" }];
const fallback = { MOVIMENTACAO: "mov" };

describe("buildImportPlan", () => {
  const plan = buildImportPlan(parsed, new Set(["h5"]), rules, fallback);
  const cat = (d: string) => plan.novas.find((r) => r.descricao === d)?.categoryId;

  test("skips already imported hashes", () => {
    expect(plan.duplicadas).toBe(1);
    expect(plan.novas.map((r) => r.hash)).not.toContain("h5");
    expect(plan.novas).toHaveLength(4);
  });

  test("categorizes rows", () => {
    expect(cat("UBER TRIP")).toBe("transp");
    expect(cat("PADARIA")).toBeNull();
    expect(cat("FULANO")).toBeNull();
    expect(cat("Cofrinho")).toBe("mov");
    expect(plan.semCategoria).toBe(2);
  });

  test("passes invalid rows through", () => {
    expect(plan.invalidas).toEqual(parsed.invalid);
  });

  test("rule wins over type fallback", () => {
    const receita: Rule[] = [{ padrao: "UBER", categoryId: "reemb", tipo: "RECEITA" }];
    const p = buildImportPlan({ rows: [row("UBER REEMBOLSO", "RECEITA", "z")], invalid: [] }, new Set(), receita, fallback);
    expect(p.novas[0].categoryId).toBe("reemb");
  });

  test("linha casada recebe tipo e categoria da regra", () => {
    const gesner: Rule[] = [{ padrao: "GESNER", categoryId: "alim", tipo: "ESTORNO" }];
    const p = buildImportPlan({ rows: [row("Gesner Borges", "RECEITA", "h6")], invalid: [] }, new Set(), gesner, fallback);
    expect(p.novas[0]).toMatchObject({ tipo: "ESTORNO", categoryId: "alim" });
    expect(p.semCategoria).toBe(0);
  });

  test("sem regra, a linha mantém o tipo do parser", () => {
    expect(plan.novas.find((r) => r.descricao === "FULANO")?.tipo).toBe("RECEITA");
  });

  test("movimentação sem regra do mesmo tipo usa a categoria padrão", () => {
    const cofrinho: Rule[] = [{ padrao: "COFRINHO", categoryId: "transp", tipo: "GASTO" }];
    const p = buildImportPlan({ rows: [row("Cofrinho", "MOVIMENTACAO", "h7")], invalid: [] }, new Set(), cofrinho, fallback);
    expect(p.novas[0]).toMatchObject({ tipo: "MOVIMENTACAO", categoryId: "mov" });
  });
});
