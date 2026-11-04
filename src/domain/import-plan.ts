import { matchRule, type Rule } from "./categorization";
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
  categoriaPorTipo: { MOVIMENTACAO: string | null },
): ImportPlan {
  const novas: PlannedRow[] = [];
  let duplicadas = 0;

  for (const row of parsed.rows) {
    if (existingHashes.has(row.hash)) {
      duplicadas++;
      continue;
    }
    // A regra define tipo e categoria. Sem regra, só movimentação tem categoria automática.
    const rule = matchRule(row, rules);
    const categoryId = rule?.categoryId ?? (row.tipo === "MOVIMENTACAO" ? categoriaPorTipo.MOVIMENTACAO : null);
    novas.push({ ...row, tipo: rule?.tipo ?? row.tipo, categoryId });
  }

  return {
    novas,
    duplicadas,
    semCategoria: novas.filter((r) => r.categoryId === null).length,
    invalidas: parsed.invalid,
  };
}
