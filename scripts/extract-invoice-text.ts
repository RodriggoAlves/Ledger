// Uso local: npx tsx scripts/extract-invoice-text.ts <fatura.pdf> > saida.txt
import { readFileSync } from "node:fs";
import { extractPdfLines } from "../src/lib/pdf-text";

const file = process.argv[2];
if (!file) throw new Error("Informe o caminho do PDF");
extractPdfLines(new Uint8Array(readFileSync(file))).then((lines) => console.log(lines.join("\n")));
