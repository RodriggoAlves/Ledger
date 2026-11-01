import { expect, test } from "vitest";
import { chunk, sanitizeTxUpdate } from "@/domain/guards";

test("chunk splits arrays", () => {
  expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  expect(chunk([], 2)).toEqual([]);
});

test("sanitizeTxUpdate keeps only categoryId and valid tipo", () => {
  const evil = { categoryId: "c1", tipo: "GASTO", userId: "other", valor: 1, hashUnico: "x" };
  expect(sanitizeTxUpdate(evil)).toEqual({ categoryId: "c1", tipo: "GASTO" });
  expect(sanitizeTxUpdate({ categoryId: null })).toEqual({ categoryId: null });
  expect(() => sanitizeTxUpdate({ tipo: "HACK" })).toThrow();
  expect(() => sanitizeTxUpdate({ categoryId: 5 })).toThrow();
});
