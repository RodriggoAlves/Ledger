import Link from "next/link";
import { ImportLink } from "@/components/import-link";
import { MonthPicker } from "@/components/month-picker";
import { RuleOfferProvider } from "@/components/rule-offer";
import { SearchParamSelect } from "@/components/search-param-select";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db/client";
import { getMonthEntries } from "@/db/entries";
import { getAvailableMonths, getCategories } from "@/db/queries";
import { categoryFilterOptions } from "@/domain/category-options";
import { entriesTotal, entryLabels, filterEntries, parseOrigin } from "@/domain/entries";
import { formatBRL } from "@/domain/money";
import { currentMonth, parseMonth } from "@/domain/month";
import { parseTipo, tipoFilterOptions } from "@/domain/tx-type";
import { requireUserId } from "@/lib/auth";
import { TransactionRow } from "./transaction-row";

type Props = { searchParams: Promise<{ mes?: string; categoria?: string; tipo?: string; origem?: string }> };

export default async function TransacoesPage({ searchParams }: Props) {
  const userId = await requireUserId();
  const sp = await searchParams;
  const [months, categories] = await Promise.all([getAvailableMonths(userId), getCategories(userId)]);

  if (!months.length) {
    return (
      <p className="text-muted-foreground">
        Nenhuma transação ainda.{" "}
        <Link href="/importar" className="underline">
          Importe um extrato
        </Link>
        .
      </p>
    );
  }

  const today = currentMonth();
  const month = parseMonth(sp.mes) ?? today;
  const tipo = parseTipo(sp.tipo);
  const categoryId =
    sp.categoria === "none" || categories.some((c) => c.id === sp.categoria) ? sp.categoria : undefined;
  const origem = parseOrigin(sp.origem);
  // Mesma lista do Dashboard (extrato + parcelas da fatura que fecha no mês), para os totais baterem.
  const lista = filterEntries(await getMonthEntries(db, userId, month), { categoryId, tipo, origem });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Transações</h1>
        <div className="flex flex-wrap items-center gap-2">
          <ImportLink />
          <MonthPicker value={month} today={today} available={months} />
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchParamSelect
          name="categoria"
          value={categoryId}
          allLabel="Todas as categorias"
          options={[
            { value: "none", label: "Sem categoria" },
            ...categoryFilterOptions(categories, tipo, categoryId).map((c) => ({ value: c.id, label: c.nome })),
          ]}
        />
        <SearchParamSelect
          name="tipo"
          value={tipo}
          allLabel="Todos os tipos"
          options={tipoFilterOptions()}
        />
        <SearchParamSelect
          name="origem"
          value={origem}
          allLabel="Todas as origens"
          options={[
            { value: "CONTA", label: "Conta" },
            { value: "CARTAO", label: "Cartão" },
          ]}
        />
      </div>

      <RuleOfferProvider>
        {lista.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma transação com esses filtros.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {lista.length} {lista.length === 1 ? "lançamento" : "lançamentos"} ·{" "}
              <span className="font-semibold text-foreground tabular-nums">{formatBRL(entriesTotal(lista))}</span>
            </p>
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
                  {lista.map((e) => (
                    <TransactionRow
                      key={`${e.origem}-${e.id}`}
                      categories={categories}
                      row={
                        e.origem === "CARTAO"
                          ? {
                              origem: "CARTAO",
                              id: e.id,
                              purchaseId: e.purchaseId,
                              data: e.data.toISOString(),
                              descricao: e.descricao,
                              valor: e.valor,
                              tipo: e.tipo,
                              categoryId: e.categoryId,
                              labels: entryLabels(e),
                            }
                          : {
                              origem: "CONTA",
                              id: e.id,
                              data: e.data.toISOString(),
                              descricao: e.descricao,
                              valor: e.valor,
                              tipo: e.tipo,
                              categoryId: e.categoryId,
                              labels: entryLabels(e),
                            }
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </RuleOfferProvider>
    </div>
  );
}
