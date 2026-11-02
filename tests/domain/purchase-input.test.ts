import { expect, test } from "vitest";
import { parsePurchaseForm, type PurchaseForm } from "@/domain/purchase-input";

const base: PurchaseForm = {
  descricao: "Geladeira",
  categoryId: "",
  valor: "1.234,56",
  modo: "total",
  parcelas: "3",
  jaPagas: "0",
  data: "2026-03-20",
};

test("parses total value with thousands separator", () => {
  expect(parsePurchaseForm(base)).toEqual({
    input: {
      descricao: "Geladeira",
      categoryId: null,
      valorTotal: 123456,
      parcelas: 3,
      jaPagas: 0,
      dataCompra: new Date("2026-03-20T00:00:00Z"),
    },
  });
});

test("parses installment value", () => {
  const r = parsePurchaseForm({ ...base, valor: "25,00", modo: "parcela", parcelas: "4" });
  expect(r).toMatchObject({ input: { valorParcela: 2500, parcelas: 4 } });
  expect("input" in r && "valorTotal" in r.input).toBe(false);
});

test("accepts value without thousands separator and keeps category", () => {
  expect(parsePurchaseForm({ ...base, valor: "1234,5", categoryId: "c1" })).toMatchObject({
    input: { valorTotal: 123450, categoryId: "c1" },
  });
});

test("requires a description", () => {
  expect(parsePurchaseForm({ ...base, descricao: "  " })).toEqual({ error: "Informe a descrição" });
});

test("rejects an invalid value", () => {
  expect(parsePurchaseForm({ ...base, valor: "abc" })).toEqual({ error: "Valor inválido" });
  expect(parsePurchaseForm({ ...base, valor: "0,00" })).toEqual({ error: "Valor inválido" });
});

test("requires the purchase date", () => {
  expect(parsePurchaseForm({ ...base, data: "" })).toEqual({ error: "Informe a data da compra" });
});

test("rejects non numeric installments", () => {
  expect(parsePurchaseForm({ ...base, parcelas: "x" })).toEqual({ error: "Número de parcelas inválido" });
});
