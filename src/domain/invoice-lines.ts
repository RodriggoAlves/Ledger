import { normalize } from "./categorization";
import type { ParsedInvoice, RawInvoiceLine } from "./picpay-invoice-parser";

export type LineKind = "PAGAMENTO" | "ESTORNO" | "COMPRA";

export type InvoiceLine = RawInvoiceLine & {
  kind: LineKind;
  dataCompra: Date;
  /** Identifica a mesma compra entre faturas (valor com sinal: estorno ≠ compra); vazio para PAGAMENTO. */
  chave: string;
  /** Compra e estorno do mesmo valor na mesma fatura. */
  pareada: boolean;
};

const monthsBetween = (from: Date, to: Date) =>
  (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();

/**
 * A linha só traz DD/MM. Ano = o mais recente que deixa a data ≤ fechamento e,
 * para a parcela N, com pelo menos N−1 meses entre a compra e o fechamento.
 */
export function purchaseDate(dia: number, mes: number, fechamento: Date, parcelaNumero: number): Date {
  let year = fechamento.getUTCFullYear();
  let date = new Date(Date.UTC(year, mes - 1, dia));
  while (date > fechamento || monthsBetween(date, fechamento) < parcelaNumero - 1) {
    date = new Date(Date.UTC(--year, mes - 1, dia));
  }
  return date;
}

/** Índices de linhas que formam par compra/estorno (mesma descrição, mesmo valor absoluto). */
export function pairedIndexes(items: { descricao: string; valor: number }[]): Set<number> {
  const paired = new Set<number>();
  items.forEach((neg, i) => {
    if (neg.valor >= 0) return;
    const j = items.findIndex(
      (pos, k) =>
        pos.valor === -neg.valor && !paired.has(k) && normalize(pos.descricao) === normalize(neg.descricao),
    );
    if (j >= 0) paired.add(i).add(j);
  });
  return paired;
}

const kindOf = (l: RawInvoiceLine): LineKind =>
  normalize(l.descricao).startsWith("PAGAMENTO DE FATURA") ? "PAGAMENTO" : l.valor < 0 ? "ESTORNO" : "COMPRA";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function resolveLines(parsed: ParsedInvoice): InvoiceLine[] {
  const occurrences = new Map<string, number>();
  const purchases = parsed.linhas.map((l) => ({ ...l, kind: kindOf(l) }));
  const paired = pairedIndexes(purchases.map((l) => (l.kind === "PAGAMENTO" ? { ...l, valor: 0 } : l)));

  return purchases.map((l, i) => {
    const dataCompra = purchaseDate(l.dia, l.mes, parsed.fechamento, l.parcela?.numero ?? 1);
    let chave = "";
    if (l.kind !== "PAGAMENTO") {
      const base = [normalize(l.descricao), isoDay(dataCompra), l.parcela?.total ?? 1, l.valor].join("|");
      const n = occurrences.get(base) ?? 0;
      occurrences.set(base, n + 1);
      chave = `${base}|${n}`;
    }
    return { ...l, dataCompra, chave, pareada: paired.has(i) };
  });
}
