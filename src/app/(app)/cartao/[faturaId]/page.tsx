import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { db } from "@/db/client";
import { getInvoice } from "@/db/credit";
import { isUuid } from "@/domain/guards";
import { formatBRL } from "@/domain/money";
import { formatMonth } from "@/domain/month";
import { requireUserId } from "@/lib/auth";
import { MarkPaidButton } from "../mark-paid-button";

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });

export default async function FaturaPage({ params }: { params: Promise<{ faturaId: string }> }) {
  const userId = await requireUserId();
  const { faturaId } = await params;
  const data = isUuid(faturaId) ? await getInvoice(db, userId, faturaId) : null;
  if (!data) notFound();

  const { invoice, itens } = data;
  const total = itens.reduce((s, i) => s + i.valor, 0);

  return (
    <div className="space-y-6">
      <Link href="/cartao" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden />
        Faturas
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold capitalize">Fatura de {formatMonth(invoice.mes)}</h1>
          <p className="text-sm text-muted-foreground">
            Fecha em {day(invoice.fechamento)} e vence em {day(invoice.vencimento)}
          </p>
        </div>
        {invoice.paga ? (
          <span className="self-start rounded-full bg-[color-mix(in_srgb,var(--income)_16%,transparent)] px-3 py-1 text-sm font-medium text-income">
            Paga
          </span>
        ) : (
          <MarkPaidButton invoiceId={invoice.id} />
        )}
      </div>

      <Card className="gap-0 py-1">
        <ul className="divide-y">
          {itens.map((item, i) => (
            <li key={i} className="flex items-center gap-3 px-(--card-spacing) py-3">
              <span className="min-w-0 flex-1 truncate font-medium">{item.descricao}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {item.numero}/{item.parcelas}
              </span>
              <span className="w-28 text-right tabular-nums">{formatBRL(item.valor)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t px-(--card-spacing) py-3">
          <span className="font-semibold">Total</span>
          <span className="font-display text-lg font-semibold tabular-nums">{formatBRL(total)}</span>
        </div>
      </Card>
    </div>
  );
}
