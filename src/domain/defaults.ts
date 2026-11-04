import type { CategoryTipo } from "./tx-type";

// Cores de gasto: paleta categórica validada para daltonismo (ordem fixa); Outros em cinza neutro.
export const DEFAULT_CATEGORIES: { nome: string; cor: string; tipo: CategoryTipo }[] = [
  { nome: "Alimentação", cor: "#eb6834", tipo: "GASTO" },
  { nome: "Transporte", cor: "#2a78d6", tipo: "GASTO" },
  { nome: "Telefone", cor: "#6250d6", tipo: "GASTO" },
  { nome: "Assinaturas", cor: "#e87ba4", tipo: "GASTO" },
  { nome: "Lazer", cor: "#eda100", tipo: "GASTO" },
  { nome: "Saúde", cor: "#1baf7a", tipo: "GASTO" },
  { nome: "Moradia", cor: "#008300", tipo: "GASTO" },
  { nome: "Compras", cor: "#e34948", tipo: "GASTO" },
  { nome: "Outros", cor: "#8a8a85", tipo: "GASTO" },
  { nome: "Salário", cor: "#16a34a", tipo: "RECEITA" },
  { nome: "Freelance / Serviços", cor: "#0d9488", tipo: "RECEITA" },
  { nome: "Reembolsos", cor: "#65a30d", tipo: "RECEITA" },
  { nome: "Outras receitas", cor: "#4d7c0f", tipo: "RECEITA" },
  { nome: "Movimentação", cor: "#94a3b8", tipo: "MOVIMENTACAO" },
  { nome: "Transferência própria", cor: "#059669", tipo: "MOVIMENTACAO" },
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
