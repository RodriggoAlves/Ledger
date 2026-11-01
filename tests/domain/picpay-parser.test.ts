import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { InvalidPicPayFileError, parsePicPayCsv } from "@/domain/picpay-parser";

const sample = readFileSync("tests/fixtures/picpay-sample.csv", "utf8");

describe("parsePicPayCsv", () => {
  const result = parsePicPayCsv(sample);
  const byDesc = (d: string) => result.rows.find((r) => r.descricao === d)!;

  test("parses all valid rows", () => {
    expect(result.rows).toHaveLength(11);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].raw).toContain("abc");
  });

  test("maps tipo", () => {
    expect(byDesc("Do cofrinho Cofrinho Turbinado").tipo).toBe("MOVIMENTACAO");
    expect(byDesc("No cofrinho Cofrinho Turbinado").tipo).toBe("MOVIMENTACAO");
    expect(byDesc("FULANO DE TAL").tipo).toBe("RECEITA");
    expect(byDesc("99 FOOD LTDA.").tipo).toBe("GASTO");
    expect(byDesc("GOOGLE").tipo).toBe("GASTO");
    expect(byDesc("LOJA X").tipo).toBe("RECEITA");
    expect(byDesc("BANCO").tipo).toBe("GASTO");
  });

  test("parses values and payment method", () => {
    expect(byDesc("No cofrinho Cofrinho Turbinado").valor).toBe(-201393);
    expect(byDesc("CICLANO").valor).toBe(-500);
    expect(byDesc("GOOGLE").formaPagamento).toBe("Com cartão");
    expect(byDesc("FULANO DE TAL").formaPagamento).toBeNull();
  });

  test("parses date and time", () => {
    const d = result.rows[0].dataHora;
    expect([d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()]).toEqual([
      2026, 9, 31, 21, 31,
    ]);
  });

  test("rejects wrong header", () => {
    expect(() => parsePicPayCsv("a,b,c\n1,2,3")).toThrow(InvalidPicPayFileError);
  });

  test("identical rows get distinct, deterministic hashes", () => {
    const twins = result.rows.filter((r) => r.descricao === "BELTRANO");
    expect(twins).toHaveLength(2);
    expect(twins[0].hash).not.toBe(twins[1].hash);
    const again = parsePicPayCsv(sample).rows.map((r) => r.hash);
    expect(again).toEqual(result.rows.map((r) => r.hash));
  });
});
