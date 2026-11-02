import Link from "next/link";
import { SearchParamSelect } from "@/components/search-param-select";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db/client";
import { getCard } from "@/db/credit";
import { getAvailableMonths, getCategories, getTransactions } from "@/db/queries";
import { formatMonth, parseMonth } from "@/domain/month";
import type { TxType } from "@/domain/picpay-parser";
import { requireUserId } from "@/lib/auth";
import { TIPO_LABEL, TransactionRow } from "./transaction-row";

type Props = { searchParams: Promise<{ mes?: string; categoria?: string; tipo?: string }> };

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

  const month = parseMonth(sp.mes) ?? months[0];
  const tipo = sp.tipo && sp.tipo in TIPO_LABEL ? (sp.tipo as TxType) : undefined;
  const categoryId =
    sp.categoria === "none" || categories.some((c) => c.id === sp.categoria) ? sp.categoria : undefined;
  const [txs, card] = await Promise.all([getTransactions(userId, { month, categoryId, tipo }), getCard(db, userId)]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Transações</h1>
      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchParamSelect
          name="mes"
          value={month}
          options={months.map((m) => ({ value: m, label: formatMonth(m) }))}
        />
        <SearchParamSelect
          name="categoria"
          value={categoryId}
          allLabel="Todas as categorias"
          options={[{ value: "none", label: "Sem categoria" }, ...categories.map((c) => ({ value: c.id, label: c.nome }))]}
        />
        <SearchParamSelect
          name="tipo"
          value={tipo}
          allLabel="Todos os tipos"
          options={Object.entries(TIPO_LABEL).map(([value, label]) => ({ value, label }))}
        />
      </div>

      {txs.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma transação com esses filtros.</p>
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
                <TableHead>Crédito</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txs.map((t) => (
                <TransactionRow
                  key={t.id}
                  categories={categories}
                  hasCard={card !== null}
                  tx={{
                    id: t.id,
                    dataHora: t.dataHora.toISOString(),
                    descricao: t.descricao,
                    valor: t.valor,
                    tipo: t.tipo,
                    categoryId: t.categoryId,
                    convertidaCredito: t.convertidaCredito,
                  }}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
