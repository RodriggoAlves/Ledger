import { describe, expect, test } from "vitest";
import { fillMonths, parsePeriodo, periodMonths } from "@/domain/reports/period";
import { conta } from "./helpers";

describe("periodMonths", () => {
  test("últimos n meses, mais antigo primeiro", () => {
    expect(periodMonths("2026-11", 3)).toEqual(["2026-09", "2026-10", "2026-11"]);
  });

  test("vira o ano", () => {
    expect(periodMonths("2026-01", 3)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

describe("parsePeriodo", () => {
  test("aceita 3, 6 e 12; padrão 6", () => {
    expect(parsePeriodo("3")).toBe(3);
    expect(parsePeriodo("12")).toBe(12);
    expect(parsePeriodo("7")).toBe(6);
    expect(parsePeriodo(undefined)).toBe(6);
  });
});

describe("fillMonths", () => {
  test("fills empty months with zeros", () => {
    const e = conta(-100);
    expect(fillMonths(["2026-10", "2026-11"], new Map([["2026-11", [e]]]))).toEqual([
      { mes: "2026-10", entries: [] },
      { mes: "2026-11", entries: [e] },
    ]);
  });
});
