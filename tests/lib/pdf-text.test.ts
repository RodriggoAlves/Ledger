import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { extractPdfLines, groupLines, PdfReadError } from "@/lib/pdf-text";

const REAL = "PicPay_Fatura_092026.pdf";

describe.skipIf(!existsSync(REAL))("extractPdfLines (fatura real)", () => {
  test("extracts left column before right column, in reading order", async () => {
    const lines = await extractPdfLines(new Uint8Array(readFileSync(REAL)));
    const i = (s: string) => lines.findIndex((l) => l.includes(s));
    expect(i("Vencimento: 05/10/2026 | Fechamento: 29/09/2026")).toBeGreaterThanOrEqual(0);
    expect(i("13/09 GOOGLE 23,99")).toBeGreaterThanOrEqual(0);
    expect(i("13/09 GOOGLE 23,99")).toBeLessThan(i("21/02 AMAZON BR PARC08/10 230,88"));
    expect(i("21/02 AMAZON BR PARC08/10 230,88")).toBeLessThan(i("20/06 MERCADOLIVRE*MPARC04/10 127,79"));
    expect(i("02/09 MP *MILAGRESDOPOR 126,50")).toBeLessThan(i("02/09 PADOCA VENCHY 22,89"));
    expect(lines).toContain("Total geral dos lançamentos 6.405,25");
  });
});

test("rejects bytes that are not a PDF", async () => {
  await expect(extractPdfLines(new TextEncoder().encode("abc"))).rejects.toBeInstanceOf(PdfReadError);
});

test("joins a description wrapped above and below the date and value", () => {
  // Coordenadas reais da fatura 10/2026 (página 2).
  const items = [
    { str: "28/09", x: 24, y: 540 },
    { str: "FIN", x: 64, y: 545 },
    { str: "AMAZONMKTPLC*SAMSUNGEL .", x: 64, y: 535 },
    { str: "3.199,00", x: 264, y: 540 },
    { str: "05/10", x: 24, y: 519 },
    { str: "PAGAMENTO DE FATURA", x: 64, y: 519 },
    { str: "-7,25", x: 276, y: 519 },
  ];
  expect(groupLines(items)).toEqual([
    "28/09 FIN AMAZONMKTPLC*SAMSUNGEL . 3.199,00",
    "05/10 PAGAMENTO DE FATURA -7,25",
  ]);
});
