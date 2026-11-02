import { expect, test } from "vitest";
import { chunk, isUuid, sanitizeTxUpdate } from "@/domain/guards";

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

test("isUuid accepts a uuid and rejects other strings", () => {
  expect(isUuid("3f2b8a6e-4c1d-4e9a-9b7f-2a1c0d5e6f70")).toBe(true);
  expect(isUuid("3F2B8A6E-4C1D-4E9A-9B7F-2A1C0D5E6F70")).toBe(true);
  expect(isUuid("abc")).toBe(false);
  expect(isUuid("")).toBe(false);
  expect(isUuid("3f2b8a6e-4c1d-4e9a-9b7f-2a1c0d5e6f70; drop table")).toBe(false);
});
