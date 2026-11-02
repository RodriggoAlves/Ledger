import { describe, expect, test } from "vitest";
import { buildImportPlan } from "@/domain/import-plan";
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
const rules = [{ padrao: "UBER", categoryId: "transp" }];
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
    const p = buildImportPlan({ rows: [row("UBER REEMBOLSO", "RECEITA", "z")], invalid: [] }, new Set(), rules, fallback);
    expect(p.novas[0].categoryId).toBe("transp");
  });
});
