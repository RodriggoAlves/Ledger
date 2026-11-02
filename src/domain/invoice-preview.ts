import { PdfPasswordError, PdfReadError } from "@/lib/pdf-text";
import { InvoiceAlreadyImportedError, InvoiceOutOfOrderError, type InvoiceImportPlan } from "./invoice-import-plan";
import { formatBRL } from "./money";
import type { MonthKey } from "./month";
import { InvalidInvoiceFileError, InvoiceTotalMismatchError } from "./picpay-invoice-parser";

export type InvoicePreview = {
  mes: MonthKey;
  /** dd/mm/aaaa */
  vencimento: string;
  totalGeral: number;
  novas: number;
  confirmadas: number;
  /** "<DESCRIÇÃO> k/n era esperada e não veio" — uma por compra (a primeira parcela que faltou). */
  naoVieram: string[];
  pagaMes: MonthKey | null;
  semCategoria: number;
  ignoradas: number;
};

export function toInvoicePreview(plan: InvoiceImportPlan): InvoicePreview {
  const first = new Map<string, InvoiceImportPlan["cancelar"][number]>();
  for (const c of plan.cancelar) {
    const key = `${c.descricao}|${c.parcelas}`;
    if (!first.has(key) || first.get(key)!.numero > c.numero) first.set(key, c);
  }
  return {
    mes: plan.mes,
    vencimento: plan.vencimento.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
    totalGeral: plan.totalGeral,
    novas: plan.novas.length,
    confirmadas: plan.confirmar.length,
    naoVieram: [...first.values()].map((c) => `${c.descricao} ${c.numero}/${c.parcelas} era esperada e não veio`),
    pagaMes: plan.pagarMes,
    semCategoria: plan.semCategoria,
    ignoradas: plan.ignoradas,
  };
}

/** Mensagem para o usuário; null para erros inesperados (o chamador loga e usa uma genérica). */
export function invoiceErrorMessage(e: unknown): string | null {
  if (e instanceof InvoiceTotalMismatchError) {
    return `A fatura não foi lida corretamente (diferença de ${formatBRL(Math.abs(e.diferenca))})`;
  }
  if (e instanceof PdfReadError || e instanceof InvalidInvoiceFileError) return "Arquivo não parece ser uma fatura do PicPay";
  if (e instanceof PdfPasswordError || e instanceof InvoiceAlreadyImportedError || e instanceof InvoiceOutOfOrderError) {
    return e.message;
  }
  return null;
}
