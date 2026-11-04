import type { TxType } from "./picpay-parser";
import { countsAsExpense } from "./tx-type";

export type CategoryTotal = {
  categoryId: string | null;
  nome: string;
  cor: string;
  /** centavos, positivo */
  total: number;
  percentual: number;
};

type SummaryTx = { valor: number; tipo: TxType; categoryId: string | null };
type SummaryCategory = { id: string; nome: string; cor: string };

const UNCATEGORIZED = { nome: "Sem categoria", cor: "#a1a1aa" };

/** Gasto líquido por categoria (positivo = gasto; estorno abate); ignora receitas e movimentações. */
function netByCategory(txs: SummaryTx[]): Map<string | null, number> {
  const totals = new Map<string | null, number>();
  for (const t of txs) {
    if (!countsAsExpense(t.tipo)) continue;
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) - t.valor);
  }
  return totals;
}

/** Categorias com gasto positivo, maior primeiro; percentual sobre a soma delas. */
function positiveCategories(totals: Map<string | null, number>, categories: SummaryCategory[]): CategoryTotal[] {
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

export type SpendingSummary = {
  /** Só categorias com gasto positivo, maior primeiro; percentual sobre a soma delas. */
  categorias: CategoryTotal[];
  /** Soma das categorias que ficaram negativas no mês (≤ 0). */
  creditos: number;
  /** Gastos do mês = soma de `categorias` + `creditos`. */
  total: number;
};

/**
 * Gastos do mês por categoria. Crédito que deixa uma categoria negativa (ex.: "pula compra")
 * não vira fatia, mas reduz o total em `creditos`.
 */
export function summarizeSpending(entries: SummaryTx[], categories: SummaryCategory[]): SpendingSummary {
  const totals = netByCategory(entries);
  const categorias = positiveCategories(totals, categories);
  const creditos = [...totals.values()].filter((t) => t < 0).reduce((s, t) => s + t, 0);
  return { categorias, creditos, total: categorias.reduce((s, c) => s + c.total, 0) + creditos };
}
