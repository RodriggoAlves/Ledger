import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  InvalidInvoiceFileError,
  InvoiceTotalMismatchError,
  parsePicPayInvoice,
} from "@/domain/picpay-invoice-parser";

const lines = readFileSync("tests/fixtures/picpay-fatura-092026.txt", "utf8").split(/\r?\n/);

describe("parsePicPayInvoice", () => {
  const parsed = parsePicPayInvoice(lines);
  const find = (d: string) => parsed.linhas.find((l) => l.descricao === d)!;

  test("reads header dates", () => {
    expect(parsed.fechamento).toEqual(new Date(Date.UTC(2026, 8, 29)));
    expect(parsed.vencimento).toEqual(new Date(Date.UTC(2026, 9, 5)));
  });

  test("reads all lines and checks the total", () => {
    expect(parsed.totalGeral).toBe(640525);
    expect(parsed.linhas.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0)).toBe(640525);
    expect(parsed.linhas).toHaveLength(74);
  });

  test("parses installments and card finals", () => {
    expect(find("AMAZON BR")).toEqual({
      dia: 21,
      mes: 2,
      descricao: "AMAZON BR",
      valor: 23088,
      parcela: { numero: 8, total: 10 },
      cartaoFinal: "9083",
    });
    expect(find("MERCADOLIVRE*M")).toMatchObject({ parcela: { numero: 4, total: 10 }, cartaoFinal: "9091" });
    expect(parsed.linhas.find((l) => l.descricao === "GOOGLE" && l.valor === 2399)).toMatchObject({
      cartaoFinal: null,
      parcela: null,
    });
  });

  test("keeps negative lines", () => {
    expect(find("PAGAMENTO DE FATURA").valor).toBe(-166155);
    expect(parsed.linhas.filter((l) => l.valor === -319900)).toHaveLength(2);
  });
});

test("rejects text without header", () => {
  expect(() => parsePicPayInvoice(["qualquer coisa"])).toThrow(InvalidInvoiceFileError);
});

test("rejects when sum differs from total", () => {
  const missing = lines.filter((l) => l !== "13/09 GOOGLE 23,99");
  try {
    parsePicPayInvoice(missing);
    expect.unreachable();
  } catch (e) {
    expect(e).toBeInstanceOf(InvoiceTotalMismatchError);
    expect((e as InvoiceTotalMismatchError).diferenca).toBe(2399);
  }
});

test("reads the credit operations section (IOF) before the national transactions", () => {
  const parsed = parsePicPayInvoice([
    "Vencimento: 05/11/2026 | Fechamento: 29/10/2026",
    "Picpay Card",
    "Operações de crédito contratados",
    "Data Operação Valor (R$)",
    "28/09 IOF DIARIO PARCELADO 10,04",
    "28/09 IOF ADICIONAL PARCELADO 12,24",
    "Transações Nacionais",
    "Data Estabelecimento Valor (R$)",
    "28/09 FIN AMAZONMKTPLC*SAMSUNGEL . 3.199,00",
    "05/10 PAGAMENTO DE FATURA -7,25",
    "Total geral dos lançamentos 3.221,28",
  ]);
  expect(parsed.linhas.map((l) => [l.descricao, l.valor, l.cartaoFinal])).toEqual([
    ["IOF DIARIO PARCELADO", 1004, null],
    ["IOF ADICIONAL PARCELADO", 1224, null],
    ["FIN AMAZONMKTPLC*SAMSUNGEL", 319900, null],
    ["PAGAMENTO DE FATURA", -725, null],
  ]);
});
