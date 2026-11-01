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
