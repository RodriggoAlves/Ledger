export type Rule = { padrao: string; categoryId: string };

export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

/** Regra casa se a descrição contém o padrão; vence a de padrão mais longo. */
export function matchCategory(descricao: string, rules: Rule[]): string | null {
  const text = normalize(descricao);
  let best: Rule | null = null;
  for (const rule of rules) {
    const padrao = normalize(rule.padrao);
    if (padrao && text.includes(padrao) && (!best || padrao.length > normalize(best.padrao).length)) {
      best = rule;
    }
  }
  return best?.categoryId ?? null;
}
