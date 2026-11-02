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
import { TableCell, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/domain/money";
import type { TxType } from "@/domain/picpay-parser";
import { createRuleFromTransaction, updateTransaction } from "./actions";

const NONE = "__none__";

export const TIPO_LABEL: Record<TxType, string> = {
  GASTO: "Gasto",
  RECEITA: "Receita",
  MOVIMENTACAO: "Movimentação",
};

const VALOR_COLOR: Record<TxType, string> = {
  GASTO: "text-expense",
  RECEITA: "text-income",
  MOVIMENTACAO: "text-transfer",
};

export type RowData = {
  id: string;
  dataHora: string;
  descricao: string;
  valor: number;
  tipo: TxType;
  categoryId: string | null;
  formaPagamento: string | null;
};

export function TransactionRow({
  tx,
  categories,
}: {
  tx: RowData;
  categories: { id: string; nome: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [ask, setAsk] = useState<{ categoryId: string; nome: string } | null>(null);

  const categoryItems = [{ value: NONE, label: "Sem categoria" }, ...categories.map((c) => ({ value: c.id, label: c.nome }))];
  const tipoItems = Object.entries(TIPO_LABEL).map(([value, label]) => ({ value, label }));

  function onCategory(value: string | null) {
    const categoryId = !value || value === NONE ? null : value;
    startTransition(async () => {
      await updateTransaction(tx.id, { categoryId });
      if (categoryId) setAsk({ categoryId, nome: categories.find((c) => c.id === categoryId)!.nome });
    });
  }

  function onTipo(tipo: TxType) {
    startTransition(() => updateTransaction(tx.id, { tipo }));
  }

  function onCreateRule() {
    if (!ask) return;
    startTransition(async () => {
      const { aplicadas } = await createRuleFromTransaction(tx.id, ask.categoryId);
      toast.success(`Regra criada · ${aplicadas} transações atualizadas`);
      setAsk(null);
    });
  }

  return (
    <TableRow className={pending ? "opacity-60" : undefined}>
      <TableCell className="whitespace-nowrap">
        {new Date(tx.dataHora).toLocaleString("pt-BR", {
          timeZone: "UTC",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </TableCell>
      <TableCell className="min-w-40">
        {tx.descricao}
        {tx.formaPagamento === "Com cartão" && (
          <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-muted-foreground">Débito</span>
        )}
      </TableCell>
      <TableCell>
        <Select items={tipoItems} value={tx.tipo} onValueChange={(v) => v && onTipo(v as TxType)} disabled={pending}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tipoItems.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select items={categoryItems} value={tx.categoryId ?? NONE} onValueChange={onCategory} disabled={pending}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categoryItems.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className={`text-right whitespace-nowrap ${VALOR_COLOR[tx.tipo]}`}>{formatBRL(tx.valor)}</TableCell>

      <Dialog open={ask !== null} onOpenChange={(open) => !open && setAsk(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar regra?</DialogTitle>
            <DialogDescription>
              Aplicar &ldquo;{tx.descricao}&rdquo; → {ask?.nome} nas próximas importações e nas transações sem
              categoria?
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
    </TableRow>
  );
}
