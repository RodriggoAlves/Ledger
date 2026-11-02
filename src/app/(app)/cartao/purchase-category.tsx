"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { useRuleOffer } from "@/components/rule-offer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { categoriesForType } from "@/domain/category-options";
import type { TxType } from "@/domain/picpay-parser";
import { createRuleFromPurchaseAction, setPurchaseCategoryAction } from "./actions";

const NONE = "__none__";

/**
 * Seletor de categoria de uma compra do cartão (vale para todas as parcelas), com a oferta de
 * criar regra. Precisa de um `RuleOfferProvider` acima.
 */
export function PurchaseCategory({
  purchaseId,
  descricao,
  categoryId,
  categories,
}: {
  purchaseId: string;
  descricao: string;
  categoryId: string | null;
  categories: { id: string; nome: string; tipo: TxType }[];
}) {
  const [pending, startTransition] = useTransition();
  const offerRule = useRuleOffer();
  // Compra do cartão é sempre gasto.
  const items = [
    { value: NONE, label: "Sem categoria" },
    ...categoriesForType(categories, "GASTO", categoryId).map((c) => ({ value: c.id, label: c.nome })),
  ];

  function onChange(value: string | null) {
    const next = !value || value === NONE ? null : value;
    startTransition(async () => {
      const res = await setPurchaseCategoryAction(purchaseId, next);
      if (res.error) toast.error(res.error);
      else if (next) {
        offerRule({
          descricao,
          nome: categories.find((c) => c.id === next)!.nome,
          alvo: "compras",
          criar: () => createRuleFromPurchaseAction(purchaseId, next),
        });
      }
    });
  }

  return (
    <Select items={items} value={categoryId ?? NONE} onValueChange={onChange} disabled={pending}>
      <SelectTrigger size="sm" className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
