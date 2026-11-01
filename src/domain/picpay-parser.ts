import { createHash } from "node:crypto";
import Papa from "papaparse";
import { parseBRL } from "./money";

export type TxType = "GASTO" | "RECEITA" | "MOVIMENTACAO";

export type ParsedRow = {
  dataHora: Date;
  tipoOriginal: string;
  descricao: string;
  valor: number;
  formaPagamento: string | null;
  tipo: TxType;
  hash: string;
};

export type ParseResult = {
  rows: ParsedRow[];
  invalid: { line: number; raw: string; reason: string }[];
};

export class InvalidPicPayFileError extends Error {
  constructor() {
    super("Arquivo não parece ser um extrato do PicPay");
  }
}

const HEADER = ["data", "hora", "tipo", "origem / destino", "valor", "forma de pagamento"];

const TIPOS: Record<string, TxType> = {
  "dinheiro guardado": "MOVIMENTACAO",
  "dinheiro resgatado": "MOVIMENTACAO",
  "pix recebido": "RECEITA",
  "pix enviado": "GASTO",
  "compra realizada": "GASTO",
};

function classify(tipoOriginal: string, valor: number): TxType {
  return TIPOS[tipoOriginal.trim().toLowerCase()] ?? (valor < 0 ? "GASTO" : "RECEITA");
}

export function parsePicPayCsv(content: string): ParseResult {
  const { data } = Papa.parse<string[]>(content.replace(/^\uFEFF/, ""), { skipEmptyLines: true });
  const [header, ...lines] = data;
  if (!header || header.map((h) => h.trim().toLowerCase()).join("|") !== HEADER.join("|")) {
    throw new InvalidPicPayFileError();
  }

  const rows: ParsedRow[] = [];
  const invalid: ParseResult["invalid"] = [];
  const occurrences = new Map<string, number>();

  lines.forEach((cols, i) => {
    const line = i + 2;
    const raw = cols.join(",");
    const [data, hora, tipoOriginal, descricao, valorTxt, forma] = cols.map((c) => c?.trim() ?? "");
    const dm = data.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const hm = hora.match(/^(\d{2}):(\d{2})$/);
    if (!dm || !hm) {
      invalid.push({ line, raw, reason: "Data ou hora inválida" });
      return;
    }
    let valor: number;
    try {
      valor = parseBRL(valorTxt);
    } catch {
      invalid.push({ line, raw, reason: "Valor inválido" });
      return;
    }

    const key = [data, hora, tipoOriginal, descricao, valor].join("|");
    const n = occurrences.get(key) ?? 0;
    occurrences.set(key, n + 1);

    rows.push({
      dataHora: new Date(Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +hm[1], +hm[2])),
      tipoOriginal,
      descricao,
      valor,
      formaPagamento: forma || null,
      tipo: classify(tipoOriginal, valor),
      hash: createHash("sha256").update(`${key}|${n}`).digest("hex"),
    });
  });

  return { rows, invalid };
}
