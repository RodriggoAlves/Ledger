import { expect, test } from "vitest";
import { InvoiceAlreadyImportedError, InvoiceOutOfOrderError, type InvoiceImportPlan } from "@/domain/invoice-import-plan";
import { invoiceErrorMessage, toInvoicePreview } from "@/domain/invoice-preview";
import { InvalidInvoiceFileError, InvoiceTotalMismatchError } from "@/domain/picpay-invoice-parser";
import { PdfPasswordError, PdfReadError } from "@/lib/pdf-text";

const plan: InvoiceImportPlan = {
  mes: "2026-10",
  fechamento: new Date(Date.UTC(2026, 9, 29)),
  vencimento: new Date(Date.UTC(2026, 10, 5)),
  totalGeral: 37735,
  novas: [],
  confirmar: [{ installmentId: "a" }, { installmentId: "b" }],
  mover: [],
  cancelar: [
    { installmentId: "c", descricao: "AMAZON BR", numero: 9, parcelas: 10 },
    { installmentId: "d", descricao: "AMAZON BR", numero: 10, parcelas: 10 },
  ],
  ajustarValor: [],
  pagarMes: "2026-09",
  pagaEm: new Date(Date.UTC(2026, 9, 5)),
  ignoradas: 1,
  semCategoria: 0,
};

test("preview lists only the first missing installment of each purchase", () => {
  expect(toInvoicePreview(plan)).toEqual({
    mes: "2026-10",
    vencimento: "05/11/2026",
    totalGeral: 37735,
    novas: 0,
    confirmadas: 2,
    naoVieram: ["AMAZON BR 9/10 era esperada e não veio"],
    pagaMes: "2026-09",
    semCategoria: 0,
    ignoradas: 1,
  });
});

test("maps known errors to user messages", () => {
  expect(invoiceErrorMessage(new PdfPasswordError())).toBe("Remova a senha do PDF antes de importar");
  expect(invoiceErrorMessage(new PdfReadError())).toBe("Arquivo não parece ser uma fatura do PicPay");
  expect(invoiceErrorMessage(new InvalidInvoiceFileError())).toBe("Arquivo não parece ser uma fatura do PicPay");
  expect(invoiceErrorMessage(new InvoiceTotalMismatchError(2399))).toBe(
    "A fatura não foi lida corretamente (diferença de R$ 23,99)",
  );
  expect(invoiceErrorMessage(new InvoiceOutOfOrderError("2026-10"))).toBe(
    "Importe as faturas em ordem: a de outubro de 2026 já foi importada",
  );
  expect(invoiceErrorMessage(new InvoiceAlreadyImportedError("2026-09"))).toBe(
    "A fatura de setembro de 2026 já foi importada",
  );
});

test("unknown errors get a generic message", () => {
  expect(invoiceErrorMessage(new Error("boom"))).toBeNull();
});
