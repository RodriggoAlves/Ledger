import { describe, expect, test } from "vitest";
import { categoriesForType, categoryFilterOptions } from "@/domain/category-options";
import type { TxType } from "@/domain/picpay-parser";

const cats: { id: string; tipo: TxType }[] = [
  { id: "a", tipo: "GASTO" },
  { id: "b", tipo: "RECEITA" },
  { id: "c", tipo: "GASTO" },
  { id: "d", tipo: "MOVIMENTACAO" },
];
const ids = (tipo: TxType, currentId: string | null) => categoriesForType(cats, tipo, currentId).map((c) => c.id);

test("filters by type", () => {
  expect(ids("GASTO", null)).toEqual(["a", "c"]);
});

test("income", () => {
  expect(ids("RECEITA", null)).toEqual(["b"]);
});

test("keeps the current category of another type", () => {
  expect(ids("RECEITA", "a")).toEqual(["a", "b"]);
});

test("current of the same type adds nothing", () => {
  expect(ids("GASTO", "c")).toEqual(["a", "c"]);
});

describe("categoryFilterOptions", () => {
  const filterIds = (tipo: TxType | undefined, selected: string | undefined) =>
    categoryFilterOptions(cats, tipo, selected).map((c) => c.id);

  test("no type selected keeps every category", () => {
    expect(filterIds(undefined, undefined)).toEqual(["a", "b", "c", "d"]);
  });

  test("a type keeps only its categories", () => {
    expect(filterIds("RECEITA", undefined)).toEqual(["b"]);
  });

  test("keeps the selected category of another type", () => {
    expect(filterIds("RECEITA", "a")).toEqual(["a", "b"]);
  });

  test("'none' (sem categoria) adds nothing", () => {
    expect(filterIds("RECEITA", "none")).toEqual(["b"]);
  });
});
