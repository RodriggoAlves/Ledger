import type { MonthKey } from "./month";

/** Datas em "horário de parede" UTC, como o restante do domínio (ver month.ts). */
export type CardDays = { diaFechamento: number; diaVencimento: number };

export type PlannedInstallment = { numero: number; mes: MonthKey; valor: number; paga: boolean };

const key = (y: number, m0: number) => {
  const date = new Date(Date.UTC(y, m0, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const parts = (mes: MonthKey) => mes.split("-").map(Number) as [number, number];

/** Dia pedido, limitado ao último dia do mês (ex.: 31 em fevereiro → 28/29). */
function clampedDay(y: number, m0: number, day: number): number {
  return Math.min(day, new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate());
}

export function addMonths(mes: MonthKey, n: number): MonthKey {
  const [y, m] = parts(mes);
  return key(y, m - 1 + n);
}

/** Mês da fatura: dia ≤ fechamento → fatura que fecha naquele mês; senão a do mês seguinte. */
export function invoiceMonthFor(dataCompra: Date, diaFechamento: number): MonthKey {
  const y = dataCompra.getUTCFullYear();
  const m0 = dataCompra.getUTCMonth();
  const closing = clampedDay(y, m0, diaFechamento);
  return key(y, dataCompra.getUTCDate() <= closing ? m0 : m0 + 1);
}

export function invoiceDates(mes: MonthKey, card: CardDays): { fechamento: Date; vencimento: Date } {
  const [y, m] = parts(mes);
  const m0 = m - 1;
  const fechamento = new Date(Date.UTC(y, m0, clampedDay(y, m0, card.diaFechamento)));
  const [dueY, dueM] = parts(card.diaVencimento > card.diaFechamento ? mes : addMonths(mes, 1));
  const vencimento = new Date(Date.UTC(dueY, dueM - 1, clampedDay(dueY, dueM - 1, card.diaVencimento)));
  return { fechamento, vencimento };
}

/** Divide em centavos; a sobra do arredondamento vai para a 1ª parcela. */
export function splitInstallments(valorTotal: number, parcelas: number): number[] {
  const base = Math.floor(valorTotal / parcelas);
  const out = Array<number>(parcelas).fill(base);
  out[0] += valorTotal - base * parcelas;
  return out;
}

export function planInstallments(
  input: { dataCompra: Date; valorTotal: number; parcelas: number; jaPagas: number },
  card: CardDays,
): PlannedInstallment[] {
  const first = invoiceMonthFor(input.dataCompra, card.diaFechamento);
  return splitInstallments(input.valorTotal, input.parcelas).map((valor, i) => ({
    numero: i + 1,
    mes: addMonths(first, i),
    valor,
    paga: i < input.jaPagas,
  }));
}
