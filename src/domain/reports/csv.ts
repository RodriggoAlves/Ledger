import { TIPO_LABEL } from "../tx-type";
import type { MonthEntries } from "./period";

const HEADER = ["Data", "Mês", "Descrição", "Tipo", "Categoria", "Origem", "Parcela", "Valor"];

const field = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Centavos → "-12,34" (vírgula decimal, sem separador de milhar). */
const decimal = (cents: number) => {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
};

/** CSV do período para Excel em pt-BR: BOM UTF-8, `;` como separador, vírgula decimal. */
export function entriesToCsv(meses: MonthEntries, cats: { id: string; nome: string }[]): string {
  const nomes = new Map(cats.map((c) => [c.id, c.nome]));
  const linhas = meses.flatMap(({ mes, entries }) =>
    [...entries]
      .sort((a, b) => a.data.getTime() - b.data.getTime() || a.descricao.localeCompare(b.descricao, "pt-BR"))
      .map((e) =>
        [
          e.data.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
          mes,
          e.descricao,
          TIPO_LABEL[e.tipo],
          (e.categoryId && nomes.get(e.categoryId)) || "",
          e.origem === "CONTA" ? "Conta" : "Cartão",
          e.origem === "CARTAO" && e.parcela ? `${e.parcela.numero}/${e.parcela.total}` : "",
          decimal(e.valor),
        ]
          .map(field)
          .join(";"),
      ),
  );
  return `﻿${[HEADER.join(";"), ...linhas].join("\r\n")}`;
}
