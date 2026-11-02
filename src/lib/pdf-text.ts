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

type Item = { str: string; x: number; y: number };

/** Itens com y até essa distância formam a mesma linha visual. */
const SAME_LINE = 2;

function columnLines(items: Item[]): string[] {
  const rows: Item[][] = [];
  for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r[0].y - it.y) <= SAME_LINE);
    if (row) row.push(it);
    else rows.push([it]);
  }
  return rows
    .map((r) => r.sort((a, b) => a.x - b.x).map((i) => i.str).join(" ").replace(/\s+/g, " ").trim())
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
    const items: Item[] = [];
    for (const raw of content.items) {
      if (!("str" in raw) || !raw.str.trim()) continue;
      items.push({ str: raw.str, x: raw.transform[4], y: raw.transform[5] });
    }
    lines.push(...columnLines(items.filter((i) => i.x < middle)), ...columnLines(items.filter((i) => i.x >= middle)));
  }
  return lines;
}
