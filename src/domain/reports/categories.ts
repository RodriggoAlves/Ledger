import { countsAsExpense } from "../tx-type";
import type { MonthEntries } from "./period";

type Cat = { id: string; nome: string; cor: string };

export type CategoryPeriod = {
  categoryId: string | null;
  nome: string;
  cor: string;
  total: number;
  /** Média mensal no período (arredondada). */
  media: number;
  /** Valor no último mês do período. */
  ultimo: number;
  /** Último mês vs média dos meses anteriores, em % com 1 casa; null sem base. */
  variacao: number | null;
  /** Um valor por mês do período. */
  serie: number[];
};

const UNCATEGORIZED = { nome: "Sem categoria", cor: "#a1a1aa" };

/** Gasto (GASTO com estornos abatidos, positivo) ou entrada (RECEITA) por categoria ao longo do período; maior primeiro. */
export function categoriesInPeriod(meses: MonthEntries, cats: Cat[], tipo: "GASTO" | "RECEITA"): CategoryPeriod[] {
  const sign = tipo === "GASTO" ? -1 : 1;
  const series = new Map<string | null, number[]>();
  meses.forEach(({ entries }, i) => {
    for (const e of entries) {
      if (tipo === "GASTO" ? !countsAsExpense(e.tipo) : e.tipo !== tipo) continue;
      const serie = series.get(e.categoryId) ?? Array<number>(meses.length).fill(0);
      serie[i] += sign * e.valor;
      series.set(e.categoryId, serie);
    }
  });

  const byId = new Map(cats.map((c) => [c.id, c]));
  return [...series]
    .map(([categoryId, serie]): CategoryPeriod => {
      const cat = (categoryId && byId.get(categoryId)) || UNCATEGORIZED;
      const total = serie.reduce((s, v) => s + v, 0);
      const ultimo = serie[serie.length - 1];
      const anteriores = serie.slice(0, -1);
      const base = anteriores.length ? anteriores.reduce((s, v) => s + v, 0) / anteriores.length : 0;
      return {
        categoryId,
        nome: cat.nome,
        cor: cat.cor,
        total,
        media: Math.round(total / serie.length),
        ultimo,
        variacao: base > 0 ? Math.round(((ultimo - base) / base) * 1000) / 10 : null,
        serie,
      };
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
}
