import type { AccountEntry, CardEntry } from "@/domain/entries";
import type { TxType } from "@/domain/picpay-parser";

let seq = 0;

export const cats = [
  { id: "alim", nome: "Alimentação", cor: "#f00" },
  { id: "transp", nome: "Transporte", cor: "#00f" },
  { id: "sal", nome: "Salário", cor: "#0f0" },
];

export function conta(
  valor: number,
  o: { tipo?: TxType; categoryId?: string | null; descricao?: string; data?: string } = {},
): AccountEntry {
  return {
    origem: "CONTA",
    id: `c${++seq}`,
    data: new Date(`${o.data ?? "2026-10-10"}T12:00:00Z`),
    descricao: o.descricao ?? "Loja",
    valor,
    tipo: o.tipo ?? (valor < 0 ? "GASTO" : "RECEITA"),
    categoryId: o.categoryId ?? null,
    formaPagamento: null,
  };
}

export function cartao(
  valor: number,
  o: { categoryId?: string | null; descricao?: string; parcela?: [number, number]; data?: string } = {},
): CardEntry {
  return {
    origem: "CARTAO",
    id: `i${++seq}`,
    purchaseId: `p${seq}`,
    data: new Date(`${o.data ?? "2026-10-10"}T12:00:00Z`),
    descricao: o.descricao ?? "Compra",
    valor,
    tipo: valor > 0 ? "ESTORNO" : "GASTO",
    categoryId: o.categoryId ?? null,
    parcela: o.parcela ? { numero: o.parcela[0], total: o.parcela[1] } : null,
    estorno: valor > 0,
  };
}
