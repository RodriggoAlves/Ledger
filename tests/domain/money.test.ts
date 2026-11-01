import { describe, expect, test } from "vitest";
import { formatBRL, parseBRL } from "@/domain/money";

describe("parseBRL", () => {
  test("parses PicPay values into cents", () => {
    expect(parseBRL("−R$ 2.013,93")).toBe(-201393);
    expect(parseBRL("-R$ 5,00")).toBe(-500);
    expect(parseBRL("+R$ 35,00")).toBe(3500);
    expect(parseBRL("R$ 0,10")).toBe(10);
  });

  test("rejects invalid text", () => {
    expect(() => parseBRL("abc")).toThrow();
    expect(() => parseBRL("")).toThrow();
  });
});

describe("formatBRL", () => {
  test("formats cents as BRL", () => {
    expect(formatBRL(-201393)).toMatch(/-R\$\s2\.013,93/);
    expect(formatBRL(3500)).toMatch(/R\$\s35,00/);
  });
});
