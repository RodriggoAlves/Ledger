"use client";

import { FileText, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { InvoiceImportSummary } from "@/db/invoice-import";
import { formatMonth } from "@/domain/month";
import { deleteInvoiceImportAction } from "./actions";

export function InvoiceImportHistory({ items }: { items: InvoiceImportSummary[] }) {
  if (!items.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Faturas importadas</h2>
      <Card className="gap-0 py-1">
        <ul className="divide-y">
          {items.map((imp) => (
            <li key={imp.id} className="flex items-center gap-3 px-(--card-spacing) py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-primary" aria-hidden>
                <FileText className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium capitalize">{formatMonth(imp.mes)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {imp.nomeArquivo}. Importado em{" "}
                  {new Date(imp.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </p>
              </div>
              <DeleteButton id={imp.id} mes={imp.mes} />
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function DeleteButton({ id, mes }: { id: string; mes: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      const res = await deleteInvoiceImportAction(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Importação da fatura excluída");
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive"
        aria-label={`Excluir importação da fatura de ${formatMonth(mes)}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 aria-hidden />
        <span className="hidden sm:inline">Excluir</span>
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir importação</DialogTitle>
            <DialogDescription>
              Excluir a importação da fatura de {formatMonth(mes)}? Essa ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={onConfirm} disabled={pending}>
              {pending ? "Excluindo..." : "Excluir importação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
