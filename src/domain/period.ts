/** Datas do extrato são "horário de parede" em UTC (ver month.ts). */
const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });

export function formatPeriod(inicio: Date | null, fim: Date | null): string {
  if (!inicio || !fim) return "sem transações";
  const a = day(inicio);
  const b = day(fim);
  return a === b ? a : `${a} a ${b}`;
}
