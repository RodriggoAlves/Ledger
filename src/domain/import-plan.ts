import { matchCategory, type Rule } from "./categorization";
import type { ParsedRow, ParseResult } from "./picpay-parser";

export type PlannedRow = ParsedRow & { categoryId: string | null };

export type ImportPlan = {
  novas: PlannedRow[];
  duplicadas: number;
  semCategoria: number;
  invalidas: ParseResult["invalid"];
};

export function buildImportPlan(
  parsed: ParseResult,
  existingHashes: Set<string>,
  rules: Rule[],
  categoriaPorTipo: { RECEITA: string | null; MOVIMENTACAO: string | null },
): ImportPlan {
  const novas: PlannedRow[] = [];
  let duplicadas = 0;

  for (const row of parsed.rows) {
    if (existingHashes.has(row.hash)) {
      duplicadas++;
      continue;
    }
    const categoryId =
      matchCategory(row.descricao, rules) ??
      (row.tipo === "GASTO" ? null : categoriaPorTipo[row.tipo]);
    novas.push({ ...row, categoryId });
  }

  return {
    novas,
    duplicadas,
    semCategoria: novas.filter((r) => r.categoryId === null).length,
    invalidas: parsed.invalid,
  };
}
