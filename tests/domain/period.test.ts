import { expect, test } from "vitest";
import { formatPeriod } from "@/domain/period";

test("formats a period across days", () => {
  expect(formatPeriod(new Date("2026-09-03T10:00:00Z"), new Date("2026-09-20T08:00:00Z"))).toBe("03/09/2026 a 20/09/2026");
});

test("formats a single day", () => {
  expect(formatPeriod(new Date("2026-09-03T10:00:00Z"), new Date("2026-09-03T22:00:00Z"))).toBe("03/09/2026");
});

test("returns 'sem transações' when empty", () => {
  expect(formatPeriod(null, null)).toBe("sem transações");
});
