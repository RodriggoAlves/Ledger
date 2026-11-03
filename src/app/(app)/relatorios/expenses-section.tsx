import { Download } from "lucide-react";
import { entryLabels } from "@/domain/entries";
import { formatBRL } from "@/domain/money";
import type { MonthKey } from "@/domain/month";
import { topExpenses, topMerchants } from "@/domain/reports/expenses";
import { loadPeriod } from "./data";
import { DataTable, Empty, Section, Td } from "./ui";

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });

export async function ExpensesSection({ userId, meses }: { userId: string; meses: MonthKey[] }) {
  const { periodo, cats } = await loadPeriod(userId, meses);
  const nomes = new Map(cats.map((c) => [c.id, c.nome]));
  const maiores = topExpenses(periodo, 10);
  const lugares = topMerchants(periodo, 10);
  const exportHref = `/relatorios/exportar?mes=${meses[meses.length - 1]}&periodo=${meses.length}`;

  return (
    <div className="space-y-6">
      <Section
        title="Maiores gastos"
        description="Os 10 maiores lançamentos do período. Compras parceladas contam pelo valor da parcela."
        action={
          <a
            href={exportHref}
            download
            className="glass flex shrink-0 items-center gap-2 self-start rounded-full px-3.5 py-2 text-sm font-semibold ring-1 ring-border transition-colors hover:ring-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Download className="size-4 text-primary" aria-hidden />
            Exportar CSV
          </a>
        }
      >
        {maiores.length === 0 ? (
          <Empty>Nenhum gasto no período.</Empty>
        ) : (
          <DataTable head={[{ label: "Data" }, { label: "Descrição" }, { label: "Categoria" }, { label: "Valor", right: true }]}>
            {maiores.map((e) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap text-muted-foreground">{day(e.data)}</Td>
                <Td className="max-w-64">
                  <span className="block truncate">{e.descricao}</span>
                  {entryLabels(e).length > 0 && <span className="text-xs text-muted-foreground">{entryLabels(e).join(" · ")}</span>}
                </Td>
                <Td className="text-muted-foreground">{(e.categoryId && nomes.get(e.categoryId)) || "Sem categoria"}</Td>
                <Td right className="font-semibold">
                  {formatBRL(-e.valor)}
                </Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>

      <Section title="Onde você mais gasta" description="Estabelecimentos e destinos agrupados pela descrição, somando conta e cartão.">
        {lugares.length === 0 ? (
          <Empty>Nenhum gasto no período.</Empty>
        ) : (
          <ol className="space-y-1">
            {lugares.map((l, i) => (
              <li key={l.nome} className="rounded-xl px-1 py-2">
                <span className="flex items-center gap-3">
                  <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="flex-1 truncate font-medium">{l.nome}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {l.vezes} {l.vezes === 1 ? "vez" : "vezes"}
                  </span>
                  <span className="w-28 text-right font-display text-sm font-semibold tabular-nums">{formatBRL(l.total)}</span>
                </span>
                <span className="mt-2 ml-8 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-[var(--series-1)]" style={{ width: `${(l.total / lugares[0].total) * 100}%` }} />
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}
