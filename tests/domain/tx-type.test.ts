import { expect, test } from "vitest";
import { parseTipo, TIPO_LABEL } from "@/domain/tx-type";

test("parseTipo accepts the three types", () => {
  expect(parseTipo("GASTO")).toBe("GASTO");
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
    ["RECEITA", "Receita"],
    ["MOVIMENTACAO", "Movimentação"],
  ]);
});
