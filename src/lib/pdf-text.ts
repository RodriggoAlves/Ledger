import { getDocumentProxy } from "unpdf";

export class PdfPasswordError extends Error {
  constructor() {
    super("Remova a senha do PDF antes de importar");
  }
}

export class PdfReadError extends Error {
  constructor() {
    super("Arquivo não parece ser uma fatura do PicPay");
  }
}

export type TextItem = { str: string; x: number; y: number };

/**
 * Itens a até essa distância vertical de algum item da linha entram nela. Cobre descrições
 * quebradas em duas linhas acima e abaixo da data/valor (±5) sem juntar linhas da tabela (~19).
 */
const SAME_LINE = 6;

/** Agrupa os itens de uma coluna em linhas visuais, de cima para baixo e da esquerda para a direita. */
export function groupLines(items: TextItem[]): string[] {
  const rows: TextItem[][] = [];
  for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((r) => r.some((m) => Math.abs(m.y - it.y) <= SAME_LINE));
    if (row) row.push(it);
    else rows.push([it]);
  }
  return rows
    .map((r) => r.sort((a, b) => a.x - b.x || b.y - a.y).map((i) => i.str).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Uma linha por linha visual; ordem: página → coluna esquerda → direita → de cima para baixo. */
export async function extractPdfLines(data: Uint8Array): Promise<string[]> {
  let pdf;
  try {
    pdf = await getDocumentProxy(data);
  } catch (e) {
    if ((e as { name?: string })?.name === "PasswordException") throw new PdfPasswordError();
    throw new PdfReadError();
  }

  const lines: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const middle = page.getViewport({ scale: 1 }).width / 2;
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const raw of content.items) {
      if (!("str" in raw) || !raw.str.trim()) continue;
      items.push({ str: raw.str, x: raw.transform[4], y: raw.transform[5] });
    }
    lines.push(...groupLines(items.filter((i) => i.x < middle)), ...groupLines(items.filter((i) => i.x >= middle)));
  }
  return lines;
}
