import { expect, test } from "vitest";
import { formatMonth, monthKey, monthRange, parseMonth } from "@/domain/month";

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
