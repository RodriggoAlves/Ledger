import { createHash } from "node:crypto";
import type { AccountEntry, MonthEntry } from "./entries";
import type { MonthKey } from "./month";
import type { TxType } from "./picpay-parser";
import type { MonthEntries } from "./reports/period";
import { isTitular } from "./titular";
import { countsAsExpense } from "./tx-type";

export type MonthStatus = "ABERTO" | "FECHADO" | "ALTERADO";

/**
 * Impressão digital dos lançamentos do mês (extrato + parcelas da fatura): muda com importação,
 * exclusão, troca de valor, tipo ou categoria. Não depende da ordem.
 */
export function entriesSignature(entries: MonthEntry[]): string {
  const linhas = entries.map((e) => `${e.origem}:${e.id}|${e.valor}|${e.tipo}|${e.categoryId ?? ""}`).sort();
  return createHash("sha256").update(linhas.join("\n")).digest("hex");
}

export function monthStatus(closing: { assinatura: string } | null | undefined, entries: MonthEntry[]): MonthStatus {
  if (!closing) return "ABERTO";
  return closing.assinatura === entriesSignature(entries) ? "FECHADO" : "ALTERADO";
}

/** Relatórios usam só meses fechados (alterados depois do fechamento continuam, com aviso). */
export function closedPeriod(
  periodo: MonthEntries,
  closings: Map<MonthKey, { assinatura: string }>,
): { periodo: MonthEntries; abertos: MonthKey[]; alterados: MonthKey[] } {
  const abertos: MonthKey[] = [];
  const alterados: MonthKey[] = [];
  const fechados = periodo.filter(({ mes, entries }) => {
    const status = monthStatus(closings.get(mes), entries);
    if (status === "ABERTO") abertos.push(mes);
    if (status === "ALTERADO") alterados.push(mes);
    return status !== "ABERTO";
  });
  return { periodo: fechados, abertos, alterados };
}

export type ClosingSteps = {
  /** Passo 2: Pix entre suas contas (qualquer tipo e sentido). */
  titular: AccountEntry[];
  /** Passo 3: receitas do extrato sem categoria. */
  entradas: AccountEntry[];
  /** Passo 4: gastos e estornos sem categoria, da conta e do cartão (inclusive Pix seus ainda como gasto). */
  gastos: MonthEntry[];
};

const doTitular = (e: MonthEntry, nome: string | null): e is AccountEntry => e.origem === "CONTA" && isTitular(e.descricao, nome);

export function closingSteps(entries: MonthEntry[], nome: string | null): ClosingSteps {
  return {
    titular: entries.filter((e) => doTitular(e, nome)),
    entradas: entries.filter(
      (e): e is AccountEntry => e.origem === "CONTA" && e.tipo === "RECEITA" && !e.categoryId && !doTitular(e, nome),
    ),
    // Inclui Pix enviado a você mesmo que segue como gasto: ou vira transferência (passo 2) ou ganha categoria.
    gastos: entries.filter((e) => countsAsExpense(e.tipo) && !e.categoryId),
  };
}

/** Itens ainda por resolver; no passo 2, só Pix recebido do titular que segue como receita sem categoria. */
export function pendingCount(steps: ClosingSteps): { titular: number; entradas: number; gastos: number; total: number } {
  const titular = steps.titular.filter((e) => e.valor > 0 && e.tipo === "RECEITA" && !e.categoryId).length;
  const entradas = steps.entradas.length;
  const gastos = steps.gastos.length;
  return { titular, entradas, gastos, total: titular + entradas + gastos };
}

/** Quanto chegou do titular no mês quando nada dele virou renda (o salário ainda não foi marcado); senão null. */
export function incomeHint(entries: MonthEntry[], nome: string | null): number | null {
  const meus = entries.filter((e) => doTitular(e, nome));
  if (meus.some((e) => e.tipo === "RECEITA")) return null;
  const recebido = meus.filter((e) => e.valor > 0).reduce((s, e) => s + e.valor, 0);
  return recebido > 0 ? recebido : null;
}

export type TitularChoice = "TRANSFERENCIA" | "GASTO" | { categoryId: string };

/**
 * "O que foi?" de um Pix do titular → tipo e categoria. Receita só para dinheiro que entra (categoria de
 * receita do usuário); gasto só para dinheiro que sai. Combinação inválida → null.
 */
export function titularChoiceToUpdate(
  choice: TitularChoice,
  valor: number,
  transferenciaId: string | null,
  receitaIds: string[],
): { tipo: TxType; categoryId: string | null } | null {
  if (choice === "TRANSFERENCIA") return { tipo: "MOVIMENTACAO", categoryId: transferenciaId };
  if (choice === "GASTO") return valor < 0 ? { tipo: "GASTO", categoryId: null } : null;
  if (typeof choice?.categoryId === "string" && valor > 0 && receitaIds.includes(choice.categoryId)) {
    return { tipo: "RECEITA", categoryId: choice.categoryId };
  }
  return null;
}
