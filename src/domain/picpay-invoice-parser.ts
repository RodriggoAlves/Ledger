export type RawInvoiceLine = {
  /** Da coluna Data (DD/MM); o ano é resolvido depois (invoice-lines.ts). */
  dia: number;
  mes: number;
  /** Sem o sufixo PARCkk/nn. */
  descricao: string;
  /** Centavos, com sinal. */
  valor: number;
  parcela: { numero: number; total: number } | null;
  /** "9109"; null = "Picpay Card" do titular. */
  cartaoFinal: string | null;
};

export type ParsedInvoice = { fechamento: Date; vencimento: Date; totalGeral: number; linhas: RawInvoiceLine[] };

export class InvalidInvoiceFileError extends Error {
  constructor() {
    super("Arquivo não parece ser uma fatura do PicPay");
  }
}

export class InvoiceTotalMismatchError extends Error {
  constructor(public diferenca: number) {
    super("A fatura não foi lida corretamente");
  }
}

const HEADER = /Vencimento:\s*(\d{2})\/(\d{2})\/(\d{4})\s*\|\s*Fechamento:\s*(\d{2})\/(\d{2})\/(\d{4})/;
const SECTION_START = /^Transações Nacionais$/;
const TOTAL = /^Total geral dos lançamentos\s+([\d.]+,\d{2})$/;
const CARD = /^Picpay Card(?: final (\d{4}))?$/;
const LINE = /^(\d{2})\/(\d{2})\s+(.+?)\s+(-?[\d.]+,\d{2})$/;
const PARC = /PARC(\d{2})\/(\d{2})$/;

/** "-1.661,55" → -166155 */
function cents(text: string): number {
  const negative = text.startsWith("-");
  const [int, dec] = text.replace("-", "").split(",");
  const value = Number(int.replace(/\./g, "")) * 100 + Number(dec);
  return negative ? -value : value;
}

const utc = (d: string, m: string, y: string) => new Date(Date.UTC(+y, +m - 1, +d));

export function parsePicPayInvoice(lines: string[]): ParsedInvoice {
  const text = lines.map((l) => l.trim());
  const header = text.map((l) => l.match(HEADER)).find(Boolean);
  const start = text.findIndex((l) => SECTION_START.test(l));
  const end = text.findIndex((l) => TOTAL.test(l));
  if (!header || start < 0 || end < start) throw new InvalidInvoiceFileError();

  const linhas: RawInvoiceLine[] = [];
  // O primeiro bloco ("Picpay Card") vem logo antes de "Transações Nacionais".
  let cartaoFinal: string | null = text[start - 1]?.match(CARD)?.[1] ?? null;
  for (const line of text.slice(start, end)) {
    const card = line.match(CARD);
    if (card) {
      cartaoFinal = card[1] ?? null;
      continue;
    }
    const m = line.match(LINE);
    if (!m) continue;
    const parc = m[3].match(PARC);
    linhas.push({
      dia: +m[1],
      mes: +m[2],
      descricao: parc ? m[3].slice(0, parc.index).trim() : m[3],
      valor: cents(m[4]),
      parcela: parc ? { numero: +parc[1], total: +parc[2] } : null,
      cartaoFinal,
    });
  }

  const totalGeral = cents(text[end].match(TOTAL)![1]);
  const soma = linhas.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0);
  if (soma !== totalGeral) throw new InvoiceTotalMismatchError(totalGeral - soma);

  const [, vd, vm, vy, fd, fm, fy] = header;
  return { fechamento: utc(fd, fm, fy), vencimento: utc(vd, vm, vy), totalGeral, linhas };
}
