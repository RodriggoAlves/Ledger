import { describe, expect, test } from "vitest";
import { shortMonth, todayDate } from "@/domain/month";

describe("shortMonth", () => {
  test("mês abreviado e ano com dois dígitos", () => {
    expect(shortMonth("2026-10")).toBe("out/26");
    expect(shortMonth("2027-01")).toBe("jan/27");
  });
});

describe("todayDate", () => {
  test("usa o dia de São Paulo, à meia-noite UTC", () => {
    expect(todayDate(new Date("2026-11-04T02:00:00Z"))).toEqual(new Date("2026-11-03T00:00:00Z"));
    expect(todayDate(new Date("2026-11-03T15:00:00Z"))).toEqual(new Date("2026-11-03T00:00:00Z"));
  });
});
