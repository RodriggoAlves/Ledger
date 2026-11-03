import { describe, expect, test } from "vitest";
import { formatBRL } from "@/domain/money";
import { parseDay, parsePercent, parseReais } from "@/domain/input";

describe("parseReais", () => {
  test("formatos aceitos", () => {
    expect(parseReais("1.234,56")).toBe(123456);
    expect(parseReais("1234,5")).toBe(123450);
    expect(parseReais("1234.56")).toBe(123456);
    expect(parseReais(" R$ 2.013,93 ")).toBe(201393);
    expect(parseReais("0")).toBe(0);
  });

  test("rejeita texto inválido e negativos", () => {
    expect(parseReais("")).toBeNull();
    expect(parseReais("abc")).toBeNull();
    expect(parseReais("-10")).toBeNull();
    expect(parseReais("1,2,3")).toBeNull();
  });
});

describe("parsePercent", () => {
  test("percentual em centésimos", () => {
    expect(parsePercent("102")).toBe(10200);
    expect(parsePercent("102,5")).toBe(10250);
    expect(parsePercent("14.90%")).toBe(1490);
    expect(parsePercent("x")).toBeNull();
  });
});

describe("parseDay", () => {
  test("data válida à meia-noite UTC", () => {
    expect(parseDay("2026-11-03")).toEqual(new Date("2026-11-03T00:00:00Z"));
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("03/11/2026")).toBeNull();
  });
});

describe("formatBRL", () => {
  test("-0 vira zero", () => {
    expect(formatBRL(-0)).toBe(formatBRL(0));
  });
});
