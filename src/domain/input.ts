/**
 * Número digitado em formulário, em pt-BR ou com ponto decimal:
 * "1.234,56", "1234,5", "1234.56", "1234". Vírgula presente → pontos são milhar.
 */
function parseDecimal(text: string): number | null {
  const t = text.trim().replace(/^R\$\s*/i, "").replace(/%$/, "").trim();
  let normal: string;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(t) || /^\d+(,\d+)?$/.test(t)) normal = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d+(\.\d+)?$/.test(t)) normal = t;
  else return null;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/** Reais → centavos; null se inválido. */
export function parseReais(text: string): number | null {
  const n = parseDecimal(text);
  return n === null ? null : Math.round(n * 100);
}

/** "102,5" → 10250 (centésimos de %); null se inválido. */
export function parsePercent(text: string): number | null {
  const n = parseDecimal(text);
  return n === null ? null : Math.round(n * 100);
}

/** "AAAA-MM-DD" → data à meia-noite UTC; null se inválida. */
export function parseDay(text: string): Date | null {
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}
