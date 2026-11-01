import type { TxType } from "./picpay-parser";

export const DEFAULT_CATEGORIES: { nome: string; cor: string; tipo: TxType }[] = [
  { nome: "Alimentação", cor: "#f97316", tipo: "GASTO" },
  { nome: "Transporte", cor: "#3b82f6", tipo: "GASTO" },
  { nome: "Telefone", cor: "#8b5cf6", tipo: "GASTO" },
  { nome: "Assinaturas", cor: "#ec4899", tipo: "GASTO" },
  { nome: "Lazer", cor: "#eab308", tipo: "GASTO" },
  { nome: "Saúde", cor: "#10b981", tipo: "GASTO" },
  { nome: "Moradia", cor: "#a16207", tipo: "GASTO" },
  { nome: "Compras", cor: "#06b6d4", tipo: "GASTO" },
  { nome: "Outros", cor: "#64748b", tipo: "GASTO" },
  { nome: "Receitas", cor: "#22c55e", tipo: "RECEITA" },
  { nome: "Movimentação", cor: "#94a3b8", tipo: "MOVIMENTACAO" },
];

export const DEFAULT_RULES: { padrao: string; categoria: string }[] = [
  { padrao: "UBER", categoria: "Transporte" },
  { padrao: "99", categoria: "Transporte" },
  { padrao: "IFOOD", categoria: "Alimentação" },
  { padrao: "99 FOOD", categoria: "Alimentação" },
  { padrao: "TIM", categoria: "Telefone" },
  { padrao: "VIVO", categoria: "Telefone" },
  { padrao: "CLARO", categoria: "Telefone" },
  { padrao: "GOOGLE", categoria: "Assinaturas" },
  { padrao: "NETFLIX", categoria: "Assinaturas" },
  { padrao: "SPOTIFY", categoria: "Assinaturas" },
];
