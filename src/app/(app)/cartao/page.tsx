import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { db } from "@/db/client";
import { listInvoices } from "@/db/credit";
import { listInvoiceImports } from "@/db/invoice-import";
import { formatBRL } from "@/domain/money";
import { formatMonth } from "@/domain/month";
import { requireUserId } from "@/lib/auth";
import { InvoiceImportForm } from "./invoice-import-form";
import { InvoiceImportHistory } from "./invoice-import-history";
import { StatusBadge } from "./status-badge";

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });

export default async function CartaoPage() {
  const userId = await requireUserId();
  const [faturas, importacoes] = await Promise.all([listInvoices(db, userId), listInvoiceImports(db, userId)]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Cartão</h1>
        <p className="text-sm text-muted-foreground">Importe a fatura do PicPay no fechamento para ver as próximas faturas.</p>
      </div>

      <InvoiceImportForm />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Faturas</h2>
        {faturas.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma fatura importada ainda. Importe o PDF da fatura do PicPay.</p>
        ) : (
          <Card className="gap-0 py-1">
            <ul className="divide-y">
              {faturas.map((f) => (
                <li key={f.id}>
                  <Link
                    href={`/cartao/${f.id}`}
                    className="flex items-center gap-3 px-(--card-spacing) py-3 transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium capitalize">{formatMonth(f.mes)}</p>
                      <p className="text-xs text-muted-foreground">Vence em {day(f.vencimento)}</p>
                    </div>
                    <StatusBadge status={f.status} />
                    <span className="w-28 text-right font-semibold tabular-nums">{formatBRL(f.total)}</span>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <InvoiceImportHistory items={importacoes} />
    </div>
  );
}
