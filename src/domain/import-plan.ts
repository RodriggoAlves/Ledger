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
  categoriaPorTipo: { MOVIMENTACAO: string | null },
): ImportPlan {
  const novas: PlannedRow[] = [];
  let duplicadas = 0;

  for (const row of parsed.rows) {
    if (existingHashes.has(row.hash)) {
      duplicadas++;
      continue;
    }
    // Sem regra, só movimentação tem categoria automática; gasto e receita ficam para o usuário.
    const categoryId =
      matchCategory(row.descricao, rules) ??
      (row.tipo === "MOVIMENTACAO" ? categoriaPorTipo.MOVIMENTACAO : null);
    novas.push({ ...row, categoryId });
  }

  return {
    novas,
    duplicadas,
    semCategoria: novas.filter((r) => r.categoryId === null).length,
    invalidas: parsed.invalid,
  };
}
