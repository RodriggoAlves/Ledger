import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { db } from "@/db/client";
import { getInvoice } from "@/db/credit";
import { getCategories } from "@/db/queries";
import { isUuid } from "@/domain/guards";
import { formatBRL } from "@/domain/money";
import { formatMonth, monthKey } from "@/domain/month";
import { requireUserId } from "@/lib/auth";
import { MarkPaidButton } from "../mark-paid-button";
import { StatusBadge } from "../status-badge";
import { PurchaseCategory } from "./purchase-category";

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });

export default async function FaturaPage({ params }: { params: Promise<{ faturaId: string }> }) {
  const userId = await requireUserId();
  const { faturaId } = await params;
  const [data, categories] = await Promise.all([
    isUuid(faturaId) ? getInvoice(db, userId, faturaId) : null,
    getCategories(userId),
  ]);
  if (!data) notFound();

  const { invoice, status, itens } = data;
  const total = itens.reduce((s, i) => s + i.valor, 0);
  const options = categories.filter((c) => c.tipo === "GASTO").map((c) => ({ id: c.id, nome: c.nome }));

  return (
    <div className="space-y-6">
      <Link href="/cartao" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden />
        Faturas
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold capitalize">Fatura de {formatMonth(monthKey(invoice.vencimento))}</h1>
          <p className="text-sm text-muted-foreground">
            Fecha em {day(invoice.fechamento)} e vence em {day(invoice.vencimento)}
          </p>
        </div>
        {status === "FECHADA" ? (
          <MarkPaidButton invoiceId={invoice.id} />
        ) : (
          <StatusBadge status={status} className="self-start px-3 py-1 text-sm" />
        )}
      </div>

      <Card className="gap-0 py-1">
        {itens.length === 0 && <p className="px-(--card-spacing) py-3 text-muted-foreground">Nenhuma parcela.</p>}
        <ul className="divide-y">
          {itens.map((item, i) => (
            <li
              key={i}
              className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-(--card-spacing) py-3 ${item.pareada ? "text-muted-foreground line-through" : ""}`}
            >
              <span className="w-20 text-sm tabular-nums">{day(item.dataCompra)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.descricao}</span>
                {item.cartaoFinal && <span className="text-xs text-muted-foreground">final {item.cartaoFinal}</span>}
              </span>
              {item.parcelas > 1 && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium tabular-nums">
                  {item.numero}/{item.parcelas}
                </span>
              )}
              <PurchaseCategory
                purchaseId={item.purchaseId}
                descricao={item.descricao}
                categoryId={item.categoryId}
                categories={options}
              />
              <span className={`w-28 text-right tabular-nums ${item.valor < 0 ? "text-income" : ""}`}>
                {formatBRL(item.valor)}
              </span>
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
