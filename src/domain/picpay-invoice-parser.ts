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

/** Datas com "/" (a partir de mar/2026) ou "-" (faturas mais antigas). */
const HEADER = /Vencimento:\s*(\d{2})[/-](\d{2})[/-](\d{4})\s*\|\s*Fechamento:\s*(\d{2})[/-](\d{2})[/-](\d{4})/;
/** "Operações de crédito contratados" (IOF, financiamentos) vem antes de "Transações Nacionais". */
const SECTION_START = /^(Transações Nacionais|Operações de crédito contratados)$/;
const TOTAL = /^Total geral dos lançamentos\s+([\d.]+,\d{2})$/;
const CARD = /^Picpay Card(?: final (\d{4}))?$/;
const LINE = /^(\d{2})\/(\d{2})\s+(.+?)\s+(-?[\d.]+,\d{2})$/;
const PARC = /PARC(\d{2})\/(\d{2})$/;
/** Internacional: "DD/MM Dólar: <US$> <US$> <R$>"; a descrição vem na linha de cima. */
const FOREIGN = /^(Dólar|Euro|Libra)\b/;
/** Nas faturas antigas o pagamento vem sem sinal de menos. */
const PAYMENT = /^PAGAMENTO DE FATURA/;
/** Resumo da 1ª página; usado quando as faturas antigas trazem estorno sem sinal. */
const CREDITS = /^Créditos e estornos\s+(-?[\d.]+,\d{2})$/;

export const UNIDENTIFIED_CREDITS = "CRÉDITOS E ESTORNOS NÃO IDENTIFICADOS";

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
  let previous = "";
  for (const line of text.slice(start, end)) {
    const card = line.match(CARD);
    if (card) {
      cartaoFinal = card[1] ?? null;
      continue;
    }
    const m = line.match(LINE);
    if (!m) {
      previous = line;
      continue;
    }
    const parc = m[3].match(PARC);
    // Descrição quebrada em duas linhas no PDF termina com " ." solto.
    const descricao = FOREIGN.test(m[3])
      ? previous
      : (parc ? m[3].slice(0, parc.index) : m[3]).replace(/\s+\.$/, "").trim();
    const valor = cents(m[4]);
    linhas.push({
      dia: +m[1],
      mes: +m[2],
      descricao,
      valor: PAYMENT.test(descricao) ? -Math.abs(valor) : valor,
      parcela: parc ? { numero: +parc[1], total: +parc[2] } : null,
      cartaoFinal,
    });
    previous = line;
  }

  const [, vd, vm, vy, fd, fm, fy] = header;
  const totalGeral = cents(text[end].match(TOTAL)![1]);
  const compras = linhas.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0);
  const estornos = linhas.filter((l) => l.valor < 0 && !PAYMENT.test(l.descricao)).reduce((s, l) => s + l.valor, 0);
  const creditos = Math.abs(cents(text.map((l) => l.match(CREDITS)).find(Boolean)?.[1] ?? "0,00"));
  // Faturas novas: total = compras. Antigas: total = compras − estornos; quando o estorno vem
  // sem sinal, não há como saber a linha, e o valor do resumo vira um crédito único.
  const naoIdentificados = creditos + estornos;
  if (compras !== totalGeral && compras + estornos !== totalGeral) {
    if (naoIdentificados > 0 && compras + estornos - naoIdentificados === totalGeral) {
      linhas.push({ dia: +fd, mes: +fm, descricao: UNIDENTIFIED_CREDITS, valor: -naoIdentificados, parcela: null, cartaoFinal: null });
    } else {
      throw new InvoiceTotalMismatchError(totalGeral - compras);
    }
  }

  return { fechamento: utc(fd, fm, fy), vencimento: utc(vd, vm, vy), totalGeral, linhas };
}
