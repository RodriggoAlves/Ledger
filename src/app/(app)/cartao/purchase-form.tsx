"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "cn";
import { createPurchaseAction } from "./actions";

const NONE = "__none__";

export function PurchaseForm({ categories }: { categories: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<"total" | "parcela">("total");
  const [categoryId, setCategoryId] = useState(NONE);

  const items = [{ value: NONE, label: "Sem categoria" }, ...categories.map((c) => ({ value: c.id, label: c.nome }))];

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createPurchaseAction({
        descricao: String(f.get("descricao")),
        categoryId: categoryId === NONE ? "" : categoryId,
        valor: String(f.get("valor")),
        modo,
        parcelas: String(f.get("parcelas")),
        jaPagas: String(f.get("jaPagas")),
        data: String(f.get("data")),
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success("Compra salva");
      router.push("/cartao");
    });
  }

  const toggle = (value: "total" | "parcela", label: string) => (
    <button
      type="button"
      onClick={() => setModo(value)}
      aria-pressed={modo === value}
      className={cn(
        "rounded-full px-3 py-1 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        modo === value ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="descricao">Descrição</Label>
        <Input id="descricao" name="descricao" placeholder="Ex.: Geladeira" required />
      </div>
      <div className="space-y-2">
        <Label>Categoria</Label>
        <Select items={items} value={categoryId} onValueChange={(v) => setCategoryId(v ?? NONE)}>
          <SelectTrigger className="w-full">
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
      </div>
      <div className="space-y-2">
        <Label htmlFor="data">Data da compra</Label>
        <Input id="data" name="data" type="date" required />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="valor">{modo === "total" ? "Valor total" : "Valor da parcela"}</Label>
          <div className="flex gap-1 rounded-full bg-muted p-0.5">
            {toggle("total", "Total")}
            {toggle("parcela", "Parcela")}
          </div>
        </div>
        <Input id="valor" name="valor" inputMode="decimal" placeholder="0,00" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="parcelas">Número de parcelas</Label>
        <Input id="parcelas" name="parcelas" type="number" min={1} max={48} defaultValue={1} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="jaPagas">Quantas parcelas já foram pagas?</Label>
        <Input id="jaPagas" name="jaPagas" type="number" min={0} max={48} defaultValue={0} />
      </div>
      {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar compra"}
        </Button>
      </div>
    </form>
  );
}
