import { ChevronRight, CreditCard, Plus } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { db } from "@/db/client";
import { getCard, listInvoices } from "@/db/credit";
import { formatBRL } from "@/domain/money";
import { formatMonth } from "@/domain/month";
import { requireUserId } from "@/lib/auth";
import { CardForm } from "./card-form";

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });

export default async function CartaoPage() {
  const userId = await requireUserId();
  const [card, faturas] = await Promise.all([getCard(db, userId), listInvoices(db, userId)]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Cartão</h1>
          <p className="text-sm text-muted-foreground">Compras parceladas e faturas do seu cartão de crédito.</p>
        </div>
        {card && (
          <Link href="/cartao/nova" className="bg-brand inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-sm font-semibold text-white">
            <Plus className="size-4" aria-hidden />
            Nova compra
          </Link>
        )}
      </div>

      <Card className="px-(--card-spacing)">
        <div className="flex items-center gap-3">
          <span className="bg-brand grid size-9 place-items-center rounded-xl text-white" aria-hidden>
            <CreditCard className="size-4" />
          </span>
          <h2 className="text-lg font-semibold">{card ? card.nome : "Configure seu cartão"}</h2>
        </div>
        <CardForm card={card} />
      </Card>

      {card && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Faturas</h2>
          {faturas.length === 0 ? (
            <p className="text-muted-foreground">
              Nenhuma compra no crédito ainda.{" "}
              <Link href="/cartao/nova" className="text-primary underline">
                Registre uma compra
              </Link>{" "}
              ou passe um gasto para o crédito em Transações.
            </p>
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
                      <span
                        className={
                          f.paga
                            ? "rounded-full bg-[color-mix(in_srgb,var(--income)_16%,transparent)] px-2.5 py-0.5 text-xs font-medium text-income"
                            : "rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {f.paga ? "Paga" : "Em aberto"}
                      </span>
                      <span className="w-28 text-right font-semibold tabular-nums">{formatBRL(f.total)}</span>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
