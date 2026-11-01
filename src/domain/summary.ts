import type { TxType } from "./picpay-parser";

export type CategoryTotal = {
  categoryId: string | null;
  nome: string;
  cor: string;
  /** centavos, positivo */
  total: number;
  percentual: number;
};

type SummaryTx = { valor: number; tipo: TxType; convertidaCredito: boolean; categoryId: string | null };
type SummaryCategory = { id: string; nome: string; cor: string };

const UNCATEGORIZED = { nome: "Sem categoria", cor: "#a1a1aa" };

/** Gastos do conjunto por categoria; ignora receitas, movimentações e compras convertidas em crédito. */
export function summarizeByCategory(txs: SummaryTx[], categories: SummaryCategory[]): CategoryTotal[] {
  const totals = new Map<string | null, number>();
  for (const t of txs) {
    if (t.tipo !== "GASTO" || t.convertidaCredito) continue;
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) - t.valor);
  }

  const byId = new Map(categories.map((c) => [c.id, c]));
  const positive = [...totals].filter(([, total]) => total > 0);
  const sum = positive.reduce((s, [, total]) => s + total, 0);

  const result = positive
    .map(([categoryId, total]) => {
      const cat = (categoryId && byId.get(categoryId)) || UNCATEGORIZED;
      return {
        categoryId,
        nome: cat.nome,
        cor: cat.cor,
        total,
        percentual: Math.round((total / sum) * 1000) / 10,
      };
    })
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));

  // O maior item absorve a sobra do arredondamento para a soma dar 100.
  if (result.length) {
    const others = result.slice(1).reduce((s, c) => s + c.percentual, 0);
    result[0].percentual = Math.round((100 - others) * 10) / 10;
  }
  return result;
}
