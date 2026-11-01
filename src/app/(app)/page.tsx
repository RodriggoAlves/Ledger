import Link from "next/link";
import { SearchParamSelect } from "@/components/search-param-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAvailableMonths, getCategories, getTransactions } from "@/db/queries";
import { formatBRL } from "@/domain/money";
import { formatMonth, parseMonth } from "@/domain/month";
import { summarizeByCategory } from "@/domain/summary";
import { requireUserId } from "@/lib/auth";
import { CategoryDonut } from "./category-donut";

type Props = { searchParams: Promise<{ mes?: string }> };

export default async function DashboardPage({ searchParams }: Props) {
  const userId = await requireUserId();
  const sp = await searchParams;
  const months = await getAvailableMonths(userId);

  if (!months.length) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">
          Nenhuma transação ainda —{" "}
          <Link href="/importar" className="underline">
            importe um extrato
          </Link>
          .
        </p>
      </div>
    );
  }

  const month = parseMonth(sp.mes) ?? months[0];
  const [txs, categories] = await Promise.all([getTransactions(userId, { month }), getCategories(userId)]);
  const summary = summarizeByCategory(txs, categories);
  const total = summary.reduce((s, c) => s + c.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <SearchParamSelect
          name="mes"
          value={month}
          options={months.map((m) => ({ value: m, label: formatMonth(m) }))}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-normal text-muted-foreground">Gastos em {formatMonth(month)}</CardTitle>
          <p className="text-3xl font-semibold tabular-nums">{formatBRL(total)}</p>
        </CardHeader>
        <CardContent>
          {summary.length === 0 ? (
            <p className="text-muted-foreground">
              Nenhum gasto neste mês.{" "}
              <Link href="/importar" className="underline">
                Importe um extrato
              </Link>
              .
            </p>
          ) : (
            <div className="grid items-center gap-6 md:grid-cols-2">
              <CategoryDonut data={summary} />
              <ul className="divide-y">
                {summary.map((c) => (
                  <li key={c.categoryId ?? "none"}>
                    <Link
                      href={`/transacoes?mes=${month}&categoria=${c.categoryId ?? "none"}&tipo=GASTO`}
                      className="flex items-center gap-3 py-2 hover:bg-muted/50"
                    >
                      <span className="size-3 shrink-0 rounded-full" style={{ background: c.cor }} aria-hidden />
                      <span className="flex-1">{c.nome}</span>
                      <span className="text-sm text-muted-foreground tabular-nums">{c.percentual}%</span>
                      <span className="w-28 text-right tabular-nums">{formatBRL(c.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
