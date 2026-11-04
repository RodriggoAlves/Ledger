"use client";

import { useTransition } from "react";
import { useRuleOffer } from "@/components/rule-offer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import { categoriesForType } from "@/domain/category-options";
import { formatBRL } from "@/domain/money";
import type { TxType } from "@/domain/picpay-parser";
import { TIPO_LABEL } from "@/domain/tx-type";
import { PurchaseCategory } from "../cartao/purchase-category";
import { createRuleFromTransaction, updateTransaction } from "./actions";

const NONE = "__none__";

const VALOR_COLOR: Record<TxType, string> = {
  GASTO: "text-expense",
  ESTORNO: "text-income",
  RECEITA: "text-income",
  MOVIMENTACAO: "text-transfer",
};

/** Linha da tabela: transação do extrato ou parcela da fatura (a categoria desta é da compra). */
export type RowData =
  | {
      origem: "CONTA";
      id: string;
      data: string;
      descricao: string;
      valor: number;
      tipo: TxType;
      categoryId: string | null;
      labels: string[];
    }
  | {
      origem: "CARTAO";
      id: string;
      purchaseId: string;
      data: string;
      descricao: string;
      valor: number;
      tipo: "GASTO" | "ESTORNO";
      categoryId: string | null;
      labels: string[];
    };

type Categories = { id: string; nome: string; tipo: TxType }[];

type RowProps<R extends RowData = RowData> = {
  row: R;
  categories: Categories;
  /** Destaca a linha com um filete na borda esquerda (ex.: pendente no meio das já resolvidas). */
  marked?: boolean;
};

export function TransactionRow({ row, ...rest }: RowProps) {
  return row.origem === "CARTAO" ? <CardEntryRow row={row} {...rest} /> : <AccountEntryRow row={row} {...rest} />;
}

const MARK = "shadow-[inset_3px_0_0_var(--brand-from)]";

function Description({ descricao, labels }: { descricao: string; labels: string[] }) {
  return (
    <TableCell className="min-w-40">
      {descricao}
      {labels.map((label) => (
        <span key={label} className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {label}
        </span>
      ))}
    </TableCell>
  );
}

/** Parcela da fatura: só a categoria é editável, e vale para a compra inteira. */
function CardEntryRow({ row, categories, marked }: RowProps<Extract<RowData, { origem: "CARTAO" }>>) {
  return (
    <TableRow>
      <TableCell className={`whitespace-nowrap ${marked ? MARK : ""}`}>
        {new Date(row.data).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
      </TableCell>
      <Description descricao={row.descricao} labels={row.labels} />
      <TableCell className="text-muted-foreground">{TIPO_LABEL[row.tipo]}</TableCell>
      <TableCell>
        <PurchaseCategory
          purchaseId={row.purchaseId}
          descricao={row.descricao}
          categoryId={row.categoryId}
          categories={categories}
        />
      </TableCell>
      <TableCell className={`text-right whitespace-nowrap ${row.valor < 0 ? "text-expense" : "text-income"}`}>
        {formatBRL(row.valor)}
      </TableCell>
    </TableRow>
  );
}

function AccountEntryRow({ row, categories, marked }: RowProps<Extract<RowData, { origem: "CONTA" }>>) {
  const [pending, startTransition] = useTransition();
  const offerRule = useRuleOffer();

  const categoryItems = [
    { value: NONE, label: "Sem categoria" },
    ...categoriesForType(categories, row.tipo, row.categoryId).map((c) => ({ value: c.id, label: c.nome })),
  ];
  const tipoItems = Object.entries(TIPO_LABEL).map(([value, label]) => ({ value, label }));

  function onCategory(value: string | null) {
    const categoryId = !value || value === NONE ? null : value;
    startTransition(async () => {
      await updateTransaction(row.id, { categoryId });
      if (categoryId) {
        offerRule({
          descricao: row.descricao,
          nome: categories.find((c) => c.id === categoryId)!.nome,
          alvo: "transações",
          criar: () => createRuleFromTransaction(row.id, categoryId),
        });
      }
    });
  }

  function onTipo(tipo: TxType) {
    startTransition(() => updateTransaction(row.id, { tipo }));
  }

  return (
    <TableRow className={pending ? "opacity-60" : undefined}>
      <TableCell className={`whitespace-nowrap ${marked ? MARK : ""}`}>
        {new Date(row.data).toLocaleString("pt-BR", {
          timeZone: "UTC",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </TableCell>
      <Description descricao={row.descricao} labels={row.labels} />
      <TableCell>
        <Select items={tipoItems} value={row.tipo} onValueChange={(v) => v && onTipo(v as TxType)} disabled={pending}>
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
        <Select items={categoryItems} value={row.categoryId ?? NONE} onValueChange={onCategory} disabled={pending}>
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
      <TableCell className={`text-right whitespace-nowrap ${VALOR_COLOR[row.tipo]}`}>{formatBRL(row.valor)}</TableCell>
    </TableRow>
  );
}
