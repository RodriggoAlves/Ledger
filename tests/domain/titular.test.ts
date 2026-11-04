import { expect, test } from "vitest";
import { cleanNome, isTitular } from "@/domain/titular";

test("casa por igualdade normalizada (Review Focus 1)", () => {
  expect(isTitular("RODRIGGO ALVES AREBA", " rodriggo alves areba ")).toBe(true);
  expect(isTitular("Rodriggo Alves Arebá", "RODRIGGO ALVES AREBA")).toBe(true);
});

test("não casa por 'contém'", () => {
  expect(isTitular("RODRIGGO ALVES AREBA LTDA", "RODRIGGO ALVES AREBA")).toBe(false);
  expect(isTitular("No cofrinho Cofrinho Turbinado", "Cofrinho")).toBe(false);
});

test("nome vazio não casa com nada (Review Focus 2)", () => {
  expect(isTitular("", "")).toBe(false);
  expect(isTitular("", "   ")).toBe(false);
  expect(isTitular("X", null)).toBe(false);
  expect(cleanNome("  ")).toBeNull();
  expect(cleanNome(undefined)).toBeNull();
  expect(cleanNome(" Rodriggo ")).toBe("Rodriggo");
});
