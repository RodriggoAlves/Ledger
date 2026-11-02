import type { InvoiceStatus } from "./invoice";
import { formatBRL } from "./money";
import type { MonthKey } from "./month";

/** Conteúdo do card "Fatura do cartão" do Dashboard. */
export type InvoiceCard = { value: string; hint: string; href: string | null };

const STATUS_LABEL: Record<Exclude<InvoiceStatus, "PROJETADA">, string> = { PAGA: "Paga", FECHADA: "Fechada" };

/** `total` é o valor da fatura que fecha em `mes`; o clique leva às compras dela em Transações. */
export function invoiceCard(
  invoice: { status: InvoiceStatus; vencimento: Date } | null,
  total: number,
  mes: MonthKey,
): InvoiceCard {
  if (!invoice) return { value: "—", hint: "Nenhuma fatura neste mês", href: null };
  const hint =
    invoice.status === "PROJETADA"
      ? "Projetada · a fatura ainda não fechou"
      : `${STATUS_LABEL[invoice.status]} · vence ${invoice.vencimento.toLocaleDateString("pt-BR", { timeZone: "UTC" })}`;
  // `|| 0` troca -0 (fatura sem parcelas ativas) por 0, que o Intl formataria como "-R$ 0,00".
  return { value: formatBRL(total || 0), hint, href: `/transacoes?mes=${mes}&origem=CARTAO` };
}
