"use client";

import { Trash2 } from "lucide-react";
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
import { deleteImportAction } from "./actions";

export function DeleteImportButton({
  id,
  nomeArquivo,
  transacoes,
  periodo,
}: {
  id: string;
  nomeArquivo: string;
  transacoes: number;
  periodo: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const message =
    transacoes === 0
      ? `Excluir a importação '${nomeArquivo}'? Ela não tem transações. Essa ação não pode ser desfeita.`
      : `Excluir a importação '${nomeArquivo}'? ${transacoes} transações de ${periodo} serão apagadas. Essa ação não pode ser desfeita.`;

  function onConfirm() {
    startTransition(async () => {
      const res = await deleteImportAction(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Importação excluída: ${res.apagadas} transações apagadas`);
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive"
        aria-label={`Excluir importação ${nomeArquivo}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 aria-hidden />
        <span className="hidden sm:inline">Excluir</span>
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir importação</DialogTitle>
            <DialogDescription>{message}</DialogDescription>
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
