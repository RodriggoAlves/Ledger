import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { pairedIndexes, purchaseDate, resolveLines } from "@/domain/invoice-lines";
import { parsePicPayInvoice, type ParsedInvoice } from "@/domain/picpay-invoice-parser";

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));
const fixture = parsePicPayInvoice(readFileSync("tests/fixtures/picpay-fatura-092026.txt", "utf8").split(/\r?\n/));

describe("purchaseDate", () => {
  const set = d(2026, 9, 29);
  test("uses the closing year when the date is not after closing", () => {
    expect(purchaseDate(21, 2, set, 8)).toEqual(d(2026, 2, 21));
    expect(purchaseDate(29, 9, set, 1)).toEqual(d(2026, 9, 29));
  });
  test("goes back a year when the date is after closing", () => {
    expect(purchaseDate(30, 9, set, 1)).toEqual(d(2025, 9, 30));
    expect(purchaseDate(15, 12, d(2027, 1, 29), 1)).toEqual(d(2026, 12, 15));
  });
  test("old installments need enough months before closing", () => {
    expect(purchaseDate(20, 9, set, 12)).toEqual(d(2025, 9, 20));
  });
});

describe("resolveLines", () => {
  const lines = resolveLines(fixture);
  const find = (desc: string, valor?: number) =>
    lines.find((l) => l.descricao === desc && (valor === undefined || l.valor === valor))!;

  test("classifies payment, refund and purchase", () => {
    expect(find("PAGAMENTO DE FATURA")).toMatchObject({ kind: "PAGAMENTO", chave: "" });
    expect(find("CREDITO PULA COMPRA").kind).toBe("ESTORNO");
    expect(find("GOOGLE", 2399).kind).toBe("COMPRA");
  });

  test("builds the purchase key", () => {
    expect(find("AMAZON BR").chave).toBe("AMAZON BR|2026-02-21|10|23088|0");
    expect(find("AMAZON BR").dataCompra).toEqual(d(2026, 2, 21));
  });

  test("pairs a purchase with its refund", () => {
    const samsung = lines.filter((l) => l.descricao === "AMAZONMKTPLC*SAMSUNGEL");
    expect(samsung.map((l) => l.pareada)).toEqual([true, true]);
    expect(find("CREDITO PULA COMPRA").pareada).toBe(false);
  });
});

test("identical lines get different occurrences", () => {
  const parsed: ParsedInvoice = {
    ...fixture,
    linhas: [
      { dia: 5, mes: 9, descricao: "PADARIA", valor: 1000, parcela: null, cartaoFinal: null },
      { dia: 5, mes: 9, descricao: "PADARIA", valor: 1000, parcela: null, cartaoFinal: "9109" },
    ],
  };
  expect(resolveLines(parsed).map((l) => l.chave)).toEqual([
    "PADARIA|2026-09-05|1|1000|0",
    "PADARIA|2026-09-05|1|1000|1",
  ]);
});

test("pairedIndexes matches each refund to one purchase only", () => {
  const items = [
    { descricao: "LOJA", valor: 500 },
    { descricao: "LOJA", valor: 500 },
    { descricao: "LOJA", valor: -500 },
  ];
  expect([...pairedIndexes(items)].sort()).toEqual([0, 2]);
});
