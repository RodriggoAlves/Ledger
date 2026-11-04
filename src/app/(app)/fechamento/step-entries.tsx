"use client";

import { useState } from "react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "cn";
import { TransactionRow, type RowData } from "../transacoes/transaction-row";

type Categories = Parameters<typeof TransactionRow>[0]["categories"];
type Modo = "PENDENTES" | "TODAS";

/**
 * Passo do fechamento com lançamentos: mostra só os sem categoria, ou todos do mês para revisar.
 * Em "Todas", as pendentes vêm primeiro e ficam marcadas; ao categorizar, a linha fica (só perde a marca).
 */
export function StepEntries({
  n,
  title,
  pendentes,
  todas,
  categories,
  vazio,
}: {
  n: number;
  title: string;
  pendentes: RowData[];
  todas: RowData[];
  categories: Categories;
  /** Texto quando o mês não tem nenhum lançamento deste passo. */
  vazio: string;
}) {
  const [modo, setModo] = useState<Modo>("PENDENTES");
  const rows = modo === "PENDENTES" ? pendentes : [...todas].sort((a, b) => Number(!!a.categoryId) - Number(!!b.categoryId));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="self-center">
          {n}. {title}
        </CardTitle>
        {todas.length > 0 && (
          <CardAction>
            <ModoToggle modo={modo} onChange={setModo} pendentes={pendentes.length} todas={todas.length} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {todas.length === 0 ? (
          <p className="text-muted-foreground">{vazio}</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground">Tudo certo.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TransactionRow
                    key={`${r.origem}-${r.id}`}
                    row={r}
                    categories={categories}
                    marked={modo === "TODAS" && !r.categoryId}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ModoToggle({
  modo,
  onChange,
  pendentes,
  todas,
}: {
  modo: Modo;
  onChange: (m: Modo) => void;
  pendentes: number;
  todas: number;
}) {
  const opcoes: { id: Modo; label: string; count: number }[] = [
    { id: "PENDENTES", label: "Pendentes", count: pendentes },
    { id: "TODAS", label: "Todas", count: todas },
  ];
  return (
    <div role="group" aria-label="Mostrar" className="inline-flex gap-1 rounded-full p-1 ring-1 ring-border">
      {opcoes.map((o) => {
        const on = o.id === modo;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              on ? "bg-brand font-semibold text-white" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
            <span className={cn("tabular-nums", on ? "text-white/75" : "text-muted-foreground/70")}>{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}
