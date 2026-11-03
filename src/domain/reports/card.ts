import type { MonthKey } from "../month";
import type { MonthEntries } from "./period";

/** Parcela ativa de uma fatura ainda não paga. `valor` positivo na compra, negativo no estorno. */
export type UnpaidInstallment = {
  mes: MonthKey;
  vencimento: Date;
  status: "FECHADA" | "PROJETADA";
  purchaseId: string;
  descricao: string;
  numero: number;
  parcelas: number;
  valor: number;
};

export type FutureInvoice = {
  mes: MonthKey;
  vencimento: Date;
  status: "FECHADA" | "PROJETADA";
  total: number;
  parcelado: number;
  avista: number;
};

export type ActiveInstallmentPlan = {
  purchaseId: string;
  descricao: string;
  valorParcela: number;
  /** Número da próxima parcela a pagar. */
  proxima: number;
  parcelas: number;
  restantes: number;
  restante: number;
  ultimoVencimento: Date;
};

/** Quanto das próximas faturas já está comprometido e quando acabam as parcelas. */
export function futureCommitment(rows: UnpaidInstallment[]): {
  faturas: FutureInvoice[];
  parcelamentos: ActiveInstallmentPlan[];
  livreEm: Date | null;
  total: number;
} {
  const faturas = new Map<MonthKey, FutureInvoice>();
  const planos = new Map<string, ActiveInstallmentPlan>();
  const primeiroMes = new Map<string, MonthKey>();
  let livreEm: Date | null = null;

  for (const r of rows) {
    const f = faturas.get(r.mes) ?? { mes: r.mes, vencimento: r.vencimento, status: r.status, total: 0, parcelado: 0, avista: 0 };
    f.total += r.valor;
    if (r.parcelas > 1) f.parcelado += r.valor;
    else f.avista += r.valor;
    faturas.set(r.mes, f);

    if (r.parcelas <= 1) continue;
    if (!livreEm || r.vencimento > livreEm) livreEm = r.vencimento;
    const p = planos.get(r.purchaseId);
    if (!p) {
      planos.set(r.purchaseId, {
        purchaseId: r.purchaseId,
        descricao: r.descricao,
        valorParcela: r.valor,
        proxima: r.numero,
        parcelas: r.parcelas,
        restantes: 1,
        restante: r.valor,
        ultimoVencimento: r.vencimento,
      });
      primeiroMes.set(r.purchaseId, r.mes);
      continue;
    }
    p.restantes++;
    p.restante += r.valor;
    if (r.mes < primeiroMes.get(r.purchaseId)!) {
      primeiroMes.set(r.purchaseId, r.mes);
      Object.assign(p, { valorParcela: r.valor, proxima: r.numero });
    }
    if (r.vencimento > p.ultimoVencimento) p.ultimoVencimento = r.vencimento;
  }

  return {
    faturas: [...faturas.values()].sort((a, b) => a.mes.localeCompare(b.mes)),
    parcelamentos: [...planos.values()].sort((a, b) => a.ultimoVencimento.getTime() - b.ultimoVencimento.getTime() || a.descricao.localeCompare(b.descricao, "pt-BR")),
    livreEm,
    total: rows.reduce((s, r) => s + r.valor, 0),
  };
}

/** Gasto no cartão por mês: compras à vista × parcelas de compras parceladas. */
export function installmentMix(meses: MonthEntries): { mes: MonthKey; avista: number; parcelado: number }[] {
  return meses.map(({ mes, entries }) => {
    let avista = 0;
    let parcelado = 0;
    for (const e of entries) {
      if (e.origem !== "CARTAO") continue;
      if (e.parcela) parcelado -= e.valor;
      else avista -= e.valor;
    }
    return { mes, avista, parcelado };
  });
}
