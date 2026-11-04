"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TitularChoice } from "@/domain/closing";
import { formatBRL } from "@/domain/money";
import type { TxType } from "@/domain/picpay-parser";
import { classifyTitularEntry } from "./actions";

export type TitularRow = { id: string; data: string; valor: number; tipo: TxType; categoryId: string | null };
type Option = { value: string; label: string };

const TRANSFERENCIA = "TRANSFERENCIA";
const GASTO = "GASTO";

/** Valor atual do seletor: transferência, gasto ou a categoria de receita; null se ainda não decidido. */
function currentValue(row: TitularRow): string | null {
  if (row.tipo === "MOVIMENTACAO") return TRANSFERENCIA;
  if (row.tipo === "RECEITA" && row.categoryId) return row.categoryId;
  if (row.tipo === "GASTO" && row.valor < 0) return GASTO;
  return null;
}

function TitularLine({ row, receitas }: { row: TitularRow; receitas: Option[] }) {
  const [pending, startTransition] = useTransition();
  const items: Option[] =
    row.valor > 0
      ? [{ value: TRANSFERENCIA, label: "Transferência própria" }, ...receitas]
      : [
          { value: TRANSFERENCIA, label: "Transferência própria" },
          { value: GASTO, label: "Gasto" },
        ];

  function onChange(value: string | null) {
    if (!value) return;
    const choice: TitularChoice = value === TRANSFERENCIA || value === GASTO ? value : { categoryId: value };
    startTransition(async () => {
      const res = await classifyTitularEntry(row.id, choice);
      if (res.error) toast.error(res.error);
    });
  }

  return (
    <li className={`flex flex-wrap items-center gap-3 py-2 ${pending ? "opacity-60" : ""}`}>
      <span className="w-16 text-muted-foreground tabular-nums">
        {new Date(row.data).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" })}
      </span>
      <span className={`w-28 text-right font-medium tabular-nums ${row.valor > 0 ? "text-income" : "text-expense"}`}>
        {formatBRL(row.valor)}
      </span>
      <Select items={items} value={currentValue(row)} onValueChange={onChange} disabled={pending}>
        <SelectTrigger size="sm" className="w-52" aria-label="O que foi?">
          <SelectValue placeholder="O que foi?" />
        </SelectTrigger>
        <SelectContent>
          {items.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </li>
  );
}

/** Passo 2: cada Pix entre suas contas recebe "O que foi?". Sem oferta de regra (o salário não é uma regra). */
export function TitularStep({ rows, receitas }: { rows: TitularRow[]; receitas: Option[] }) {
  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <TitularLine key={r.id} row={r} receitas={receitas} />
      ))}
    </ul>
  );
}
