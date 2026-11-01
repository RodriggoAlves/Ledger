const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "−R$ 2.013,93" → -201393 (centavos). Aceita "−" (U+2212), "-" ou "+". */
export function parseBRL(text: string): number {
  const match = text
    .trim()
    .replace(/\u2212/g, "-")
    .match(/^([+-])?\s*R\$\s*([\d.]+),(\d{2})$/);
  if (!match) throw new Error(`Valor inválido: "${text}"`);
  const [, sign, int, dec] = match;
  const cents = Number(int.replace(/\./g, "")) * 100 + Number(dec);
  return sign === "-" ? -cents : cents;
}

export function formatBRL(cents: number): string {
  return BRL.format(cents / 100).replace(/\u2212/g, "-");
}
