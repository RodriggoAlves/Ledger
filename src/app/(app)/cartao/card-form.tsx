"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveCardAction } from "./actions";

type CardValues = { nome: string; diaFechamento: number; diaVencimento: number };

export function CardForm({ card }: { card: CardValues | null }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await saveCardAction({
        nome: String(f.get("nome")),
        diaFechamento: Number(f.get("diaFechamento")),
        diaVencimento: Number(f.get("diaVencimento")),
      });
      setError(res.error ?? null);
      if (!res.error) toast.success("Cartão salvo");
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
      <div className="space-y-2">
        <Label htmlFor="nome">Nome do cartão</Label>
        <Input id="nome" name="nome" defaultValue={card?.nome} placeholder="Ex.: PicPay Card" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="diaFechamento">Dia de fechamento</Label>
        <Input id="diaFechamento" name="diaFechamento" type="number" min={1} max={31} defaultValue={card?.diaFechamento} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="diaVencimento">Dia de vencimento</Label>
        <Input id="diaVencimento" name="diaVencimento" type="number" min={1} max={31} defaultValue={card?.diaVencimento} required />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Salvar cartão"}
      </Button>
      {error && <p className="text-sm text-destructive sm:col-span-4">{error}</p>}
    </form>
  );
}
