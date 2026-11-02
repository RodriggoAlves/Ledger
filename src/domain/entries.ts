import type { TxType } from "./picpay-parser";

/** De onde vem o lançamento: extrato da conta ou parcela da fatura do cartão. */
export type EntryOrigin = "CONTA" | "CARTAO";

export type AccountRow = {
  id: string;
  dataHora: Date;
  descricao: string;
  valor: number;
  tipo: TxType;
  categoryId: string | null;
  formaPagamento: string | null;
};

/** Parcela como gravada: valor positivo na compra, negativo no estorno. */
export type CardRow = {
  installmentId: string;
  purchaseId: string;
  dataCompra: Date;
  descricao: string;
  valor: number;
  numero: number;
  parcelas: number;
  categoryId: string | null;
  tipo: "COMPRA" | "ESTORNO";
  cancelada: boolean;
};

type EntryBase = {
  id: string;
  data: Date;
  descricao: string;
  /** Centavos, com sinal: gasto negativo. */
  valor: number;
  tipo: TxType;
  categoryId: string | null;
};

export type AccountEntry = EntryBase & { origem: "CONTA"; formaPagamento: string | null };

export type CardEntry = EntryBase & {
  origem: "CARTAO";
  /** A categoria pertence à compra; editar muda todas as parcelas. */
  purchaseId: string;
  parcela: { numero: number; total: number } | null;
  estorno: boolean;
};

/** Um item do mês, na mesma forma para Dashboard e Transações. */
export type MonthEntry = AccountEntry | CardEntry;

/** categoryId "none" = sem categoria. */
export type EntryFilters = { categoryId?: string; tipo?: TxType; origem?: EntryOrigin };

/**
 * Lançamentos do mês: transações do extrato e parcelas não canceladas da fatura que fecha no mês.
 * Mais recente primeiro; empate pela descrição.
 */
export function buildMonthEntries(account: AccountRow[], card: CardRow[]): MonthEntry[] {
  const entries: MonthEntry[] = [
    ...account.map(
      (t): AccountEntry => ({
        origem: "CONTA",
        id: t.id,
        data: t.dataHora,
        descricao: t.descricao,
        valor: t.valor,
        tipo: t.tipo,
        categoryId: t.categoryId,
        formaPagamento: t.formaPagamento,
      }),
    ),
    ...card
      .filter((p) => !p.cancelada)
      .map(
        (p): CardEntry => ({
          origem: "CARTAO",
          id: p.installmentId,
          purchaseId: p.purchaseId,
          data: p.dataCompra,
          descricao: p.descricao,
          valor: -p.valor,
          tipo: "GASTO",
          categoryId: p.categoryId,
          parcela: p.parcelas > 1 ? { numero: p.numero, total: p.parcelas } : null,
          estorno: p.tipo === "ESTORNO",
        }),
      ),
  ];
  return entries.sort((a, b) => b.data.getTime() - a.data.getTime() || a.descricao.localeCompare(b.descricao, "pt-BR"));
}

export function filterEntries(entries: MonthEntry[], filters: EntryFilters): MonthEntry[] {
  const { categoryId, tipo, origem } = filters;
  return entries.filter(
    (e) =>
      (!categoryId || e.categoryId === (categoryId === "none" ? null : categoryId)) &&
      (!tipo || e.tipo === tipo) &&
      (!origem || e.origem === origem),
  );
}

/** Soma com sinal (centavos). */
export function entriesTotal(entries: MonthEntry[]): number {
  return entries.reduce((s, e) => s + e.valor, 0);
}

export function entryLabels(entry: MonthEntry): string[] {
  if (entry.origem === "CONTA") return entry.formaPagamento === "Com cartão" ? ["Débito"] : [];
  if (entry.estorno) return ["Estorno no crédito"];
  return entry.parcela ? ["Compra no crédito", `${entry.parcela.numero}/${entry.parcela.total}`] : ["Compra no crédito"];
}

export function parseOrigin(value: string | undefined): EntryOrigin | undefined {
  return value === "CONTA" || value === "CARTAO" ? value : undefined;
}
