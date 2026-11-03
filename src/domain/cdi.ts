/** CDI anual em centésimos de % (1365 = 13,65% a.a.); usado só sem API e sem cache. */
export const CDI_PADRAO = 1365;

/** Série SGS 4389 do Banco Central: CDI anualizado base 252. */
export const BCB_CDI_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json";

export type CdiFonte = "MANUAL" | "BCB" | "PADRAO";
export type Cdi = { taxaAnual: number; fonte: CdiFonte; data: string | null };

/** `[{ data: "dd/mm/aaaa", valor: "14.90" }]` → `{ data: "AAAA-MM-DD", taxaAnual: 1490 }`. */
export function parseBcbCdi(json: unknown): { data: string; taxaAnual: number } {
  if (!Array.isArray(json) || json.length === 0) throw new Error("Resposta do CDI vazia");
  const last = json[json.length - 1] as { data?: unknown; valor?: unknown };
  const d = typeof last?.data === "string" ? last.data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/) : null;
  const valor = typeof last?.valor === "string" ? last.valor.trim() : "";
  if (!d || !/^\d+(\.\d+)?$/.test(valor)) throw new Error("Resposta do CDI em formato inesperado");
  return { data: `${d[3]}-${d[2]}-${d[1]}`, taxaAnual: Math.round(Number(valor) * 100) };
}

const spDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Busca no máximo uma vez por dia (relógio de São Paulo). */
export function shouldFetch(ultimaBusca: Date | null, agora: Date): boolean {
  return !ultimaBusca || spDay(ultimaBusca) !== spDay(agora);
}

/** Taxa manual do usuário > última taxa do Banco Central > padrão. */
export function resolveCdi(i: { override: number | null; cached: { data: string; taxaAnual: number } | null }): Cdi {
  if (i.override !== null) return { taxaAnual: i.override, fonte: "MANUAL", data: null };
  if (i.cached) return { taxaAnual: i.cached.taxaAnual, fonte: "BCB", data: i.cached.data };
  return { taxaAnual: CDI_PADRAO, fonte: "PADRAO", data: null };
}

/** 1490 → "14,90%". */
export function formatPercent(centesimos: number, casas = 2): string {
  return `${(centesimos / 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}
