"use client";

import { CreditCard, Undo2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { convertTransactionAction, undoConversionAction } from "./actions";

/** Célula "Crédito" da linha: passa um gasto para o cartão ou desfaz a conversão. */
export function CreditCell({
  id,
  descricao,
  convertida,
  canConvert,
}: {
  id: string;
  descricao: string;
  convertida: boolean;
  canConvert: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onUndo() {
    startTransition(async () => {
      const res = await undoConversionAction(id);
      if (res.error) toast.error(res.error);
      else toast.success("Conversão desfeita");
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await convertTransactionAction(id, {
        parcelas: Number(f.get("parcelas")),
        jaPagas: Number(f.get("jaPagas") || 0),
      });
      setError(res.error ?? null);
      if (!res.error) {
        toast.success("Compra passada para o crédito");
        setOpen(false);
      }
    });
  }

  if (convertida) {
    return (
      <div className="flex items-center gap-1">
        <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-primary">Crédito</span>
        <Button variant="ghost" size="icon-sm" onClick={onUndo} disabled={pending} aria-label="Desfazer conversão" title="Desfazer conversão">
          <Undo2 />
        </Button>
      </div>
    );
  }
  if (!canConvert) return null;

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="text-muted-foreground">
        <CreditCard aria-hidden />
        Passar para o crédito
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Passar para o crédito</DialogTitle>
              <DialogDescription>
                &ldquo;{descricao}&rdquo; sai dos gastos da conta e passa a contar pelas parcelas nas faturas.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`parcelas-${id}`}>Número de parcelas</Label>
                <Input id={`parcelas-${id}`} name="parcelas" type="number" min={1} max={48} defaultValue={1} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`jaPagas-${id}`}>Quantas parcelas já foram pagas?</Label>
                <Input id={`jaPagas-${id}`} name="jaPagas" type="number" min={0} max={48} defaultValue={0} />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Passar para o crédito"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
