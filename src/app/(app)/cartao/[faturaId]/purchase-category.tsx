"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createRuleFromPurchaseAction, setPurchaseCategoryAction } from "../actions";

const NONE = "__none__";

/** Seletor de categoria de uma compra do cartão, com a oferta de criar regra (igual às transações). */
export function PurchaseCategory({
  purchaseId,
  descricao,
  categoryId,
  categories,
}: {
  purchaseId: string;
  descricao: string;
  categoryId: string | null;
  categories: { id: string; nome: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [ask, setAsk] = useState<{ categoryId: string; nome: string } | null>(null);
  const items = [{ value: NONE, label: "Sem categoria" }, ...categories.map((c) => ({ value: c.id, label: c.nome }))];

  function onChange(value: string | null) {
    const next = !value || value === NONE ? null : value;
    startTransition(async () => {
      const res = await setPurchaseCategoryAction(purchaseId, next);
      if (res.error) toast.error(res.error);
      else if (next) setAsk({ categoryId: next, nome: categories.find((c) => c.id === next)!.nome });
    });
  }

  function onCreateRule() {
    if (!ask) return;
    startTransition(async () => {
      const res = await createRuleFromPurchaseAction(purchaseId, ask.categoryId);
      if (res.error) toast.error(res.error);
      else toast.success(`Regra criada · ${res.aplicadas} compras atualizadas`);
      setAsk(null);
    });
  }

  return (
    <>
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
      <Dialog open={ask !== null} onOpenChange={(open) => !open && setAsk(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar regra?</DialogTitle>
            <DialogDescription>
              Aplicar &ldquo;{descricao}&rdquo; → {ask?.nome} nas próximas importações e nas compras sem categoria?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsk(null)}>
              Não
            </Button>
            <Button onClick={onCreateRule} disabled={pending}>
              Sim, criar regra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
