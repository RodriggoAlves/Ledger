import { describe, expect, test } from "vitest";
import { currentMonth, formatMonth, monthKey, monthRange, monthSearch, parseMonth } from "@/domain/month";

test("monthRange returns [start, next month start)", () => {
  const [start, end] = monthRange("2026-12");
  expect(start).toEqual(new Date(Date.UTC(2026, 11, 1)));
  expect(end).toEqual(new Date(Date.UTC(2027, 0, 1)));
});

test("parseMonth validates input", () => {
  expect(parseMonth("2026-10")).toBe("2026-10");
  expect(parseMonth("2026-13")).toBeNull();
  expect(parseMonth("abc")).toBeNull();
  expect(parseMonth(undefined)).toBeNull();
});

test("monthKey and formatMonth", () => {
  expect(monthKey(new Date(Date.UTC(2026, 0, 31, 23)))).toBe("2026-01");
  expect(formatMonth("2026-10")).toBe("outubro de 2026");
});

test("currentMonth uses the Brazilian clock, not UTC", () => {
  // 01/12 01:30 UTC ainda é 30/11 22:30 em São Paulo
  expect(currentMonth(new Date("2026-12-01T01:30:00Z"))).toBe("2026-11");
  expect(currentMonth(new Date("2026-12-01T03:30:00Z"))).toBe("2026-12");
});

describe("monthSearch", () => {
  test("o mês padrão da página sai da URL; os demais ficam em ?mes=", () => {
    expect(monthSearch("aba=x", "2026-11", "2026-11")).toBe("aba=x");
    expect(monthSearch("mes=2026-09", "2026-10", "2026-11")).toBe("mes=2026-10");
  });

  test("página cujo padrão não é o mês atual (fechamento) mantém o mês atual na URL", () => {
    expect(monthSearch("mes=2026-09", "2026-11", "2026-10")).toBe("mes=2026-11");
    expect(monthSearch("mes=2026-09", "2026-10", "2026-10")).toBe("");
  });
});
