import type { TxType } from "./picpay-parser";
import { type CategoryTipo, categoryTipo, TIPO_LABEL } from "./tx-type";

/** "Descrição contém `padrao`" → o lançamento vira `tipo` na categoria `categoryId`. */
export type Rule = { padrao: string; categoryId: string; tipo: TxType };

/** O que uma regra olha num lançamento. */
export type RuleTarget = { descricao: string; valor: number; tipo: TxType };

export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

function contains(descricao: string, padrao: string): boolean {
  const p = normalize(padrao);
  return p !== "" && normalize(descricao).includes(p);
}

/** Gasto só casa com dinheiro que sai; receita e estorno, com dinheiro que entra; movimentação, com os dois. */
function fitsDirection(tipo: TxType, valor: number): boolean {
  if (tipo === "GASTO") return valor < 0;
  if (tipo === "RECEITA" || tipo === "ESTORNO") return valor > 0;
  return true;
}

/** Tipos que o parser já sabe com certeza: só regras do mesmo tipo mexem nessas linhas. */
const FIXED: TxType[] = ["MOVIMENTACAO", "ESTORNO"];

export function ruleApplies(rule: Rule, row: RuleTarget): boolean {
  return (
    contains(row.descricao, rule.padrao) &&
    fitsDirection(rule.tipo, row.valor) &&
    (!FIXED.includes(row.tipo) || rule.tipo === row.tipo)
  );
}

function longest<R extends { padrao: string }>(rules: R[]): R | null {
  let best: R | null = null;
  for (const r of rules) if (!best || normalize(r.padrao).length > normalize(best.padrao).length) best = r;
  return best;
}

/**
 * Regra que vale para o lançamento: entre as aplicáveis, a de padrão mais longo.
 * No PicPay a descrição é o nome da outra pessoa, e o mesmo nome aparece em Pix enviado e recebido; o sentido separa os dois.
 */
export function matchRule(row: RuleTarget, rules: Rule[]): Rule | null {
  return longest(rules.filter((r) => ruleApplies(r, row)));
}

/** Ids das transações sem categoria que uma regra recém-criada deve alcançar. */
export function newRuleTargets(rows: (RuleTarget & { id: string })[], rule: Rule): string[] {
  return rows.filter((r) => ruleApplies(rule, r)).map((r) => r.id);
}

/** Categoria de uma compra do cartão: só regras de gasto valem (o estorno do cartão herda a da compra). */
export function matchPurchaseCategory(descricao: string, rules: Rule[]): string | null {
  return longest(rules.filter((r) => r.tipo === "GASTO" && contains(descricao, r.padrao)))?.categoryId ?? null;
}

/** Erro de uma regra informada pelo usuário, ou null se tipo e categoria combinam. */
export function ruleInputError(tipo: unknown, category: { tipo: TxType } | undefined): string | null {
  if (typeof tipo !== "string" || !Object.hasOwn(TIPO_LABEL, tipo)) return "Tipo inválido";
  if (!category) return "Escolha uma categoria";
  if (categoryTipo(tipo as TxType) !== category.tipo) return "A categoria não combina com o tipo";
  return null;
}

/** Tipo de uma regra depois que a sua categoria muda de tipo: mantém o que ainda combina (ex.: estorno → categoria de gasto). */
export function ruleTipoAfterCategoryMove(ruleTipo: TxType, novoTipoCategoria: CategoryTipo): TxType {
  return categoryTipo(ruleTipo) === novoTipoCategoria ? ruleTipo : novoTipoCategoria;
}
