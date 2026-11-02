export type PurchaseInput = {
  descricao: string;
  categoryId: string | null;
  dataCompra: Date;
  parcelas: number;
  jaPagas: number;
} & ({ valorTotal: number } | { valorParcela: number });

/** Campos do formulário de compra, como chegam do cliente. */
export type PurchaseForm = {
  descricao: string;
  categoryId: string;
  valor: string;
  modo: "total" | "parcela";
  parcelas: string;
  jaPagas: string;
  /** "AAAA-MM-DD" do input date. */
  data: string;
};

/** "1.234,56" ou "1234,5" → centavos; null se inválido ou não positivo. */
function parseCents(text: string): number | null {
  const m = String(text).trim().match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/);
  if (!m) return null;
  const cents = Number(m[1].replace(/\./g, "")) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
  return cents > 0 ? cents : null;
}

const int = (text: string) => (/^\d+$/.test(String(text).trim()) ? Number(text) : NaN);

export function parsePurchaseForm(f: PurchaseForm): { input: PurchaseInput } | { error: string } {
  const descricao = String(f.descricao ?? "").trim();
  if (!descricao) return { error: "Informe a descrição" };
  const valor = parseCents(f.valor);
  if (valor === null) return { error: "Valor inválido" };
  const parcelas = int(f.parcelas);
  const jaPagas = int(f.jaPagas || "0");
  if (Number.isNaN(parcelas) || Number.isNaN(jaPagas)) return { error: "Número de parcelas inválido" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.data ?? ""))) return { error: "Informe a data da compra" };
  const dataCompra = new Date(`${f.data}T00:00:00Z`);
  if (Number.isNaN(dataCompra.getTime())) return { error: "Informe a data da compra" };

  const common = { descricao, categoryId: f.categoryId || null, dataCompra, parcelas, jaPagas };
  return { input: f.modo === "parcela" ? { ...common, valorParcela: valor } : { ...common, valorTotal: valor } };
}
