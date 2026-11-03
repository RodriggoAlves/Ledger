/** Datas do extrato são "horário de parede" armazenadas como UTC; exibir sempre com timeZone "UTC". */
/** Mês no formato "AAAA-MM". */
export type MonthKey = string;

export function parseMonth(value: string | undefined | null): MonthKey | null {
  const m = value?.match(/^(\d{4})-(\d{2})$/);
  if (!m || +m[2] < 1 || +m[2] > 12) return null;
  return value!;
}

export function monthKey(date: Date): MonthKey {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** [início do mês, início do mês seguinte) */
export function monthRange(month: MonthKey): [Date, Date] {
  const [y, m] = month.split("-").map(Number);
  return [new Date(Date.UTC(y, m - 1, 1)), new Date(Date.UTC(y, m, 1))];
}

export function formatMonth(month: MonthKey): string {
  return monthRange(month)[0].toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Mês corrente no relógio do Brasil (o servidor roda em UTC). */
export function currentMonth(now: Date = new Date(), timeZone = "America/Sao_Paulo"): MonthKey {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}`;
}

const CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-10" → "out/26", para eixos de gráfico. */
export function shortMonth(month: MonthKey): string {
  const [y, m] = month.split("-");
  return `${CURTO[Number(m) - 1]}/${y.slice(2)}`;
}

/** Hoje no relógio do Brasil, como data à meia-noite UTC (a convenção das datas do extrato). */
export function todayDate(now: Date = new Date(), timeZone = "America/Sao_Paulo"): Date {
  const [y, m, d] = now.toLocaleDateString("en-CA", { timeZone }).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
