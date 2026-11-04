import { expect, test } from "vitest";
import type { TxType } from "@/domain/picpay-parser";
import { CATEGORY_TIPOS, categoryTipo, countsAsExpense, parseTipo, TIPO_LABEL, tipoFilterOptions } from "@/domain/tx-type";

test("parseTipo accepts the four types", () => {
  expect(parseTipo("GASTO")).toBe("GASTO");
  expect(parseTipo("ESTORNO")).toBe("ESTORNO");
  expect(parseTipo("RECEITA")).toBe("RECEITA");
  expect(parseTipo("MOVIMENTACAO")).toBe("MOVIMENTACAO");
});

test("parseTipo rejects anything else, including inherited keys", () => {
  expect(parseTipo("xyz")).toBeUndefined();
  expect(parseTipo("")).toBeUndefined();
  expect(parseTipo(undefined)).toBeUndefined();
  expect(parseTipo("toString")).toBeUndefined();
});

test("labels for the Tipo filter", () => {
  expect(Object.entries(TIPO_LABEL)).toEqual([
    ["GASTO", "Gasto"],
    ["ESTORNO", "Estorno"],
    ["RECEITA", "Receita"],
    ["MOVIMENTACAO", "Movimentação"],
  ]);
});

test("countsAsExpense: gasto e estorno contam; receita e movimentação não", () => {
  const tipos: TxType[] = ["GASTO", "ESTORNO", "RECEITA", "MOVIMENTACAO"];
  expect(tipos.map(countsAsExpense)).toEqual([true, true, false, false]);
});

test("categoryTipo: estorno usa categorias de gasto", () => {
  expect(categoryTipo("ESTORNO")).toBe("GASTO");
  expect(categoryTipo("GASTO")).toBe("GASTO");
  expect(categoryTipo("RECEITA")).toBe("RECEITA");
  expect(categoryTipo("MOVIMENTACAO")).toBe("MOVIMENTACAO");
  expect(CATEGORY_TIPOS).toEqual(["GASTO", "RECEITA", "MOVIMENTACAO"]);
});

test("filtro de tipo: gasto traz estornos junto", () => {
  expect(tipoFilterOptions()).toEqual([
    { value: "GASTO", label: "Gastos e estornos" },
    { value: "ESTORNO", label: "Estorno" },
    { value: "RECEITA", label: "Receita" },
    { value: "MOVIMENTACAO", label: "Movimentação" },
  ]);
});
