import { matchCategory, type Rule } from "./categorization";
import { addMonths, dueMonth } from "./invoice";
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
  /** Parcelas canceladas antes que voltaram a valer (parcela atrasada). */
  reativar: { installmentId: string }[];
  pagarMes: MonthKey | null;
  pagaEm: Date | null;
  ignoradas: number;
  semCategoria: number;
};

/**
 * Chave sem valor, ocorrência e ano: "descrição|MM-DD|parcelas". O ano é inferido pelo número da
 * parcela, e parcelas antecipadas chegam antes do previsto e caem no ano errado.
 */
const looseKey = (chave: string) => {
  const [descricao, data, parcelas] = chave.split("|");
  return [descricao, data.slice(5), parcelas].join("|");
};

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
  const days = { diaFechamento: parsed.fechamento.getUTCDate(), diaVencimento: parsed.vencimento.getUTCDate() };
  // Mensagens usam o mês de vencimento, como o banco nomeia a fatura.
  if (state.importedMonths.includes(mes)) throw new InvoiceAlreadyImportedError(dueMonth(mes, days));
  const latest = state.importedMonths.reduce<MonthKey | null>((max, m) => (max && max > m ? max : m), null);
  if (latest && latest > mes) throw new InvoiceOutOfOrderError(dueMonth(latest, days));

  const byChave = new Map(state.purchases.map((p) => [p.chave, p]));
  const seen = new Set<string>();
  const confirmedNow = new Set<string>();
  /** Parcela k ainda em aberto (projetada ou cancelada), não confirmada nesta fatura. */
  const openInstallment = (p: CardState["purchases"][number], k: number) =>
    p.installments.find((i) => i.numero === k && !i.confirmada && !confirmedNow.has(i.id));
  /**
   * Reserva para parcelados: mesma descrição, data e nº de parcelas, com a parcela em aberto.
   * Cobre a sobra do arredondamento na 1ª parcela (o valor faz parte da chave) e várias
   * parcelas da mesma compra na mesma fatura (a ocorrência da chave muda).
   */
  const looseMatch = (chave: string, k: number) => {
    const loose = looseKey(chave);
    return state.purchases.find((p) => looseKey(p.chave) === loose && openInstallment(p, k));
  };
  const currentMes = new Map(state.purchases.flatMap((p) => p.installments.map((i) => [i.id, i.mes] as const)));
  const currentValor = new Map(state.purchases.flatMap((p) => p.installments.map((i) => [i.id, i.valor] as const)));
  const reativados = new Set<string>();
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
    reativar: [],
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
    const exact = byChave.get(line.chave);
    const existing =
      exact && (!line.parcela || openInstallment(exact, k)) ? exact : line.parcela ? (looseMatch(line.chave, k) ?? exact) : exact;
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
    const inst = openInstallment(existing, k);
    if (!inst) {
      plan.ignoradas++;
      continue;
    }
    confirmedNow.add(inst.id);
    plan.confirmar.push({ installmentId: inst.id });
    // Reprojeta a partir desta parcela; parcelas canceladas (atrasadas) voltam a valer.
    const following = existing.installments
      .filter((i) => i.numero >= k && !i.confirmada && (i.id === inst.id || !confirmedNow.has(i.id)))
      .sort((a, b) => a.numero - b.numero);
    for (const next of following) {
      if (next.cancelada && !reativados.has(next.id)) {
        reativados.add(next.id);
        plan.reativar.push({ installmentId: next.id });
      }
      const expected = addMonths(mes, next.numero - k);
      if (currentMes.get(next.id) !== expected) {
        currentMes.set(next.id, expected);
        plan.mover.push({ installmentId: next.id, mes: expected });
      }
      if (currentValor.get(next.id) !== line.valor) {
        currentValor.set(next.id, line.valor);
        plan.ajustarValor.push({ installmentId: next.id, valor: line.valor });
      }
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
