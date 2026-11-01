import { describe, expect, test } from "vitest";
import { matchCategory, normalize } from "@/domain/categorization";
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from "@/domain/defaults";

const rules = [
  { padrao: "99", categoryId: "transp" },
  { padrao: "99 FOOD", categoryId: "alim" },
  { padrao: "uber", categoryId: "transp" },
];

describe("matchCategory", () => {
  test("longest matching rule wins", () => {
    expect(matchCategory("99 FOOD LTDA.", rules)).toBe("alim");
    expect(matchCategory("99 TECNOLOGIA", rules)).toBe("transp");
  });

  test("is case and accent insensitive", () => {
    expect(matchCategory("Uber *Trip", rules)).toBe("transp");
    expect(matchCategory("Úber", rules)).toBe("transp");
  });

  test("returns null when nothing matches", () => {
    expect(matchCategory("Padaria", rules)).toBeNull();
    expect(matchCategory("Padaria", [])).toBeNull();
  });
});

test("normalize", () => {
  expect(normalize(" São Paulo ")).toBe("SAO PAULO");
});

test("default rules reference existing default categories", () => {
  const names = new Set(DEFAULT_CATEGORIES.map((c) => c.nome));
  expect(DEFAULT_CATEGORIES).toHaveLength(11);
  expect(DEFAULT_RULES).toHaveLength(10);
  for (const r of DEFAULT_RULES) expect(names.has(r.categoria)).toBe(true);
});
