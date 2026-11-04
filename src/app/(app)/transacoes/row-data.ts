import { entryLabels, type MonthEntry } from "@/domain/entries";
import type { RowData } from "./transaction-row";

/** Lançamento do mês → dados serializáveis da linha de Transações (também usada no fechamento). */
export function toRowData(e: MonthEntry): RowData {
  return e.origem === "CARTAO"
    ? {
        origem: "CARTAO",
        id: e.id,
        purchaseId: e.purchaseId,
        data: e.data.toISOString(),
        descricao: e.descricao,
        valor: e.valor,
        tipo: e.tipo,
        categoryId: e.categoryId,
        labels: entryLabels(e),
      }
    : {
        origem: "CONTA",
        id: e.id,
        data: e.data.toISOString(),
        descricao: e.descricao,
        valor: e.valor,
        tipo: e.tipo,
        categoryId: e.categoryId,
        labels: entryLabels(e),
      };
}
