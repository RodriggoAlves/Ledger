import { matchCategory, type Rule } from "./categorization";
import { addMonths } from "./invoice";
import type { InvoiceLine } from "./invoice-lines";
import { formatMonth, monthKey, type MonthKey } from "./month";
import type { ParsedInvoice } from "./picpay-invoice-parser";

/** Estado atual do cartão (carregado do banco). */
export type CardState = {
  importedMonths: MonthKey[];
  purchases: {
    id: string;
    chave: string;
    descricao: string;
    parcelas: number;
    installments: { id: string; numero: number; mes: MonthKey; valor: number; confirmada: boolean; cancelada: boolean }[];
  }[];
};

export type NewPurchase = {
  chave: string;
  tipo: "COMPRA" | "ESTORNO";
  descricao: string;
  categoryId: string | null;
  dataCompra: Date;
  parcelas: number;
  parcelaInicial: number;
  /** Centavos; negativo no estorno. */
  valorParcela: number;
  cartaoFinal: string | null;
  installments: { numero: number; mes: MonthKey; confirmada: boolean }[];
};

export type InvoiceImportPlan = {
  mes: MonthKey;
  fechamento: Date;
  vencimento: Date;
  totalGeral: number;
  novas: NewPurchase[];
  confirmar: { installmentId: string }[];
  /** Reprojeções: parcela que veio (ou vem) em outro mês do previsto. */
  mover: { installmentId: string; mes: MonthKey }[];
  cancelar: { installmentId: string; descricao: string; numero: number; parcelas: number }[];
  /** Parcela confirmada (e as projetadas seguintes) com valor diferente do previsto, ex.: sobra do arredondamento na 1ª. */
  ajustarValor: { installmentId: string; valor: number }[];
  pagarMes: MonthKey | null;
  pagaEm: Date | null;
  ignoradas: number;
  semCategoria: number;
};

/** Chave sem valor e ocorrência: "descrição|data|parcelas". */
const looseKey = (chave: string) => chave.split("|").slice(0, 3).join("|");

export class InvoiceAlreadyImportedError extends Error {
  constructor(mes: MonthKey) {
    super(`A fatura de ${formatMonth(mes)} já foi importada`);
  }
}

export class InvoiceOutOfOrderError extends Error {
  constructor(latest: MonthKey) {
    super(`Importe as faturas em ordem: a de ${formatMonth(latest)} já foi importada`);
  }
}

export function buildInvoiceImportPlan(
  parsed: ParsedInvoice,
  lines: InvoiceLine[],
  state: CardState,
  rules: Rule[],
): InvoiceImportPlan {
  const mes = monthKey(parsed.fechamento);
  if (state.importedMonths.includes(mes)) throw new InvoiceAlreadyImportedError(mes);
  const latest = state.importedMonths.reduce<MonthKey | null>((max, m) => (max && max > m ? max : m), null);
  if (latest && latest > mes) throw new InvoiceOutOfOrderError(latest);

  const byChave = new Map(state.purchases.map((p) => [p.chave, p]));
  const seen = new Set<string>();
  /**
   * Reserva para parcelados: mesma descrição, data e nº de parcelas, com a parcela em aberto.
   * A 1ª parcela costuma ter a sobra do arredondamento, então o valor (parte da chave) muda.
   */
  const looseMatch = (chave: string, k: number) => {
    const loose = looseKey(chave);
    return state.purchases.find(
      (p) =>
        !seen.has(p.id) &&
        looseKey(p.chave) === loose &&
        p.installments.some((i) => i.numero === k && !i.confirmada && !i.cancelada),
    );
  };
  const plan: InvoiceImportPlan = {
    mes,
    fechamento: parsed.fechamento,
    vencimento: parsed.vencimento,
    totalGeral: parsed.totalGeral,
    novas: [],
    confirmar: [],
    mover: [],
    cancelar: [],
    ajustarValor: [],
    pagarMes: null,
    pagaEm: null,
    ignoradas: 0,
    semCategoria: 0,
  };

  for (const line of lines) {
    if (line.kind === "PAGAMENTO") {
      plan.pagarMes = addMonths(mes, -1);
      plan.pagaEm = line.dataCompra;
      continue;
    }

    const k = line.parcela?.numero ?? 1;
    const existing = byChave.get(line.chave) ?? (line.parcela ? looseMatch(line.chave, k) : undefined);
    if (!existing) {
      const parcelas = line.parcela?.total ?? 1;
      const categoryId = matchCategory(line.descricao, rules);
      if (!categoryId) plan.semCategoria++;
      plan.novas.push({
        chave: line.chave,
        tipo: line.kind,
        descricao: line.descricao,
        categoryId,
        dataCompra: line.dataCompra,
        parcelas,
        parcelaInicial: k,
        valorParcela: line.valor,
        cartaoFinal: line.cartaoFinal,
        installments: Array.from({ length: parcelas - k + 1 }, (_, i) => ({
          numero: k + i,
          mes: addMonths(mes, i),
          confirmada: i === 0,
        })),
      });
      continue;
    }

    seen.add(existing.id);
    const inst = existing.installments.find((i) => i.numero === k);
    if (!inst || inst.confirmada || inst.cancelada) {
      plan.ignoradas++;
      continue;
    }
    plan.confirmar.push({ installmentId: inst.id });
    for (const next of existing.installments) {
      if (next.numero < k || (next.numero > k && (next.confirmada || next.cancelada))) continue;
      const expected = addMonths(mes, next.numero - k);
      if (next.mes !== expected) plan.mover.push({ installmentId: next.id, mes: expected });
      if (next.valor !== line.valor) plan.ajustarValor.push({ installmentId: next.id, valor: line.valor });
    }
  }

  // Projeções deste mês que não vieram: cancela a parcela e as seguintes da compra.
  for (const p of state.purchases) {
    if (seen.has(p.id)) continue;
    const pending = p.installments.filter((i) => !i.confirmada && !i.cancelada);
    const missing = pending.find((i) => i.mes === mes);
    if (!missing) continue;
    for (const i of pending.filter((i) => i.numero >= missing.numero).sort((a, b) => a.numero - b.numero)) {
      plan.cancelar.push({ installmentId: i.id, descricao: p.descricao, numero: i.numero, parcelas: p.parcelas });
    }
  }

  return plan;
}
