import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { db } from "@/db/client";
import { getCard } from "@/db/credit";
import { getCategories } from "@/db/queries";
import { requireUserId } from "@/lib/auth";
import { PurchaseForm } from "../purchase-form";

export default async function NovaCompraPage() {
  const userId = await requireUserId();
  const [card, categories] = await Promise.all([getCard(db, userId), getCategories(userId)]);
  if (!card) redirect("/cartao");

  return (
    <div className="space-y-6">
      <Link href="/cartao" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden />
        Cartão
      </Link>
      <div>
        <h1 className="text-3xl font-semibold">Nova compra no crédito</h1>
        <p className="text-sm text-muted-foreground">As parcelas entram nas faturas do {card.nome}.</p>
      </div>
      <Card className="px-(--card-spacing)">
        <PurchaseForm categories={categories.filter((c) => c.tipo === "GASTO")} />
      </Card>
    </div>
  );
}
