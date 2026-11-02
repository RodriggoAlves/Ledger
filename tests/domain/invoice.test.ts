import { describe, expect, test } from "vitest";
import { addMonths, invoiceDates, invoiceMonthFor, planInstallments, splitInstallments } from "@/domain/invoice";

const card = { diaFechamento: 10, diaVencimento: 17 };
const d = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("invoiceMonthFor", () => {
  test("purchase on the closing day stays in the same month", () => {
    expect(invoiceMonthFor(d("2026-03-10"), 10)).toBe("2026-03");
  });
  test("purchase after the closing day goes to next month", () => {
    expect(invoiceMonthFor(d("2026-03-11"), 10)).toBe("2026-04");
  });
  test("turns the year", () => {
    expect(invoiceMonthFor(d("2026-12-15"), 10)).toBe("2027-01");
  });
  test("closing day 31 in a short month keeps purchases of the last day", () => {
    expect(invoiceMonthFor(d("2026-02-28"), 31)).toBe("2026-02");
  });
});

describe("invoiceDates", () => {
  test("due date after closing is in the same month", () => {
    expect(invoiceDates("2026-03", card)).toEqual({
      fechamento: new Date(Date.UTC(2026, 2, 10)),
      vencimento: new Date(Date.UTC(2026, 2, 17)),
    });
  });
  test("due date before closing is in the next month", () => {
    expect(invoiceDates("2026-03", { diaFechamento: 25, diaVencimento: 5 })).toEqual({
      fechamento: new Date(Date.UTC(2026, 2, 25)),
      vencimento: new Date(Date.UTC(2026, 3, 5)),
    });
  });
  test("day 31 in February becomes the last day", () => {
    expect(invoiceDates("2026-02", { diaFechamento: 31, diaVencimento: 10 }).fechamento).toEqual(
      new Date(Date.UTC(2026, 1, 28)),
    );
  });
});

test("addMonths crosses the year", () => {
  expect(addMonths("2026-11", 3)).toBe("2027-02");
  expect(addMonths("2026-01", 0)).toBe("2026-01");
});

describe("splitInstallments", () => {
  test("remainder goes to the first installment", () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
  });
  test("exact division", () => {
    expect(splitInstallments(9000, 3)).toEqual([3000, 3000, 3000]);
  });
});

test("planInstallments spreads over invoices and marks paid ones", () => {
  const plan = planInstallments({ dataCompra: d("2026-03-20"), valorTotal: 10000, parcelas: 3, jaPagas: 1 }, card);
  expect(plan).toEqual([
    { numero: 1, mes: "2026-04", valor: 3334, paga: true },
    { numero: 2, mes: "2026-05", valor: 3333, paga: false },
    { numero: 3, mes: "2026-06", valor: 3333, paga: false },
  ]);
});
