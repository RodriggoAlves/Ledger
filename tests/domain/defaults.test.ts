import { expect, test } from "vitest";
import { DEFAULT_CATEGORIES } from "@/domain/defaults";

test("no generic 'Receitas' category", () => {
  expect(DEFAULT_CATEGORIES.map((c) => c.nome)).not.toContain("Receitas");
});

test("income categories", () => {
  expect(DEFAULT_CATEGORIES.filter((c) => c.tipo === "RECEITA").map((c) => c.nome)).toEqual([
    "Salário",
    "Freelance / Serviços",
    "Reembolsos",
    "Transferência própria",
    "Outras receitas",
  ]);
});

test("unique names", () => {
  const nomes = DEFAULT_CATEGORIES.map((c) => c.nome);
  expect(new Set(nomes).size).toBe(nomes.length);
});
