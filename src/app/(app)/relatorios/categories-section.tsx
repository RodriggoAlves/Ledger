import Link from "next/link";
import { MonthBars, type Series } from "@/components/charts";
import { formatBRL } from "@/domain/money";
import { currentMonth, shortMonth, type MonthKey } from "@/domain/month";
import { categoriesInPeriod, type CategoryPeriod } from "@/domain/reports/categories";
import { transactionsHref } from "@/domain/transactions-link";
import { loadPeriod } from "./data";
import { DataTable, Empty, Section, Td, Variation } from "./ui";

/** As 6 maiores viram séries; o resto soma em "Outras" (cores fixas por categoria, nunca recicladas). */
const TOP = 6;

function chartOf(cats: CategoryPeriod[], meses: MonthKey[]) {
  const top = cats.slice(0, TOP);
  const rest = cats.slice(TOP);
  const series: Series[] = top.map((c, i) => ({ key: `c${i}`, label: c.nome, color: c.cor }));
  if (rest.length) series.push({ key: "outras", label: `Outras (${rest.length})`, color: "var(--series-other)" });
  const data = meses.map((mes, m) => ({
    label: shortMonth(mes),
    ...Object.fromEntries(top.map((c, i) => [`c${i}`, Math.max(0, c.serie[m])])),
    ...(rest.length ? { outras: Math.max(0, rest.reduce((s, c) => s + c.serie[m], 0)) } : {}),
  }));
  return { series, data };
}

function CategoryTable({ cats, fim, tipo }: { cats: CategoryPeriod[]; fim: MonthKey; tipo: "GASTO" | "RECEITA" }) {
  return (
    <DataTable
      head={[
        { label: "Categoria" },
        { label: "Total", right: true },
        { label: "Média/mês", right: true },
        { label: "Último mês", right: true },
        { label: "vs. média anterior", right: true },
      ]}
    >
      {cats.map((c) => (
        <tr key={c.categoryId ?? "none"}>
          <Td>
            <Link
              href={transactionsHref(fim, { categoryId: c.categoryId ?? "none", tipo })}
              className="flex items-center gap-2 hover:underline"
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.cor }} aria-hidden />
              <span className="truncate">{c.nome}</span>
            </Link>
          </Td>
          <Td right className="font-semibold">
            {formatBRL(c.total)}
          </Td>
          <Td right>{formatBRL(c.media)}</Td>
          <Td right>{formatBRL(c.ultimo)}</Td>
          <Td right>
            <Variation value={c.variacao} bom={tipo === "GASTO" ? "cair" : "subir"} />
          </Td>
        </tr>
      ))}
    </DataTable>
  );
}

export async function CategoriesSection({ userId, meses }: { userId: string; meses: MonthKey[] }) {
  const { periodo, cats } = await loadPeriod(userId, meses);
  const gastos = categoriesInPeriod(periodo, cats, "GASTO");
  const receitas = categoriesInPeriod(periodo, cats, "RECEITA");
  // Só os meses fechados entram: séries, gráficos e "último mês" seguem essa lista.
  const fechados = periodo.map((m) => m.mes);
  const fim = fechados[fechados.length - 1] ?? meses[meses.length - 1];
  const g = chartOf(gastos, fechados);
  const r = chartOf(receitas, fechados);
  const parcial = fim === currentMonth() ? " O último mês ainda está em andamento, então tende a aparecer abaixo da média." : "";

  return (
    <div className="space-y-6">
      <Section
        title="Gastos por categoria"
        description={`A variação compara o último mês com a média dos meses anteriores do período.${parcial}`}
      >
        {gastos.length === 0 ? (
          <Empty>Nenhum gasto no período.</Empty>
        ) : (
          <>
            <MonthBars stacked label="Gastos por categoria em cada mês" data={g.data} series={g.series} />
            <CategoryTable cats={gastos} fim={fim} tipo="GASTO" />
          </>
        )}
      </Section>

      <Section title="Fontes de receita" description="De onde veio o dinheiro que entrou, mês a mês.">
        {receitas.length === 0 ? (
          <Empty>Nenhuma entrada no período.</Empty>
        ) : (
          <>
            <MonthBars stacked label="Entradas por categoria de receita em cada mês" data={r.data} series={r.series} />
            <CategoryTable cats={receitas} fim={fim} tipo="RECEITA" />
          </>
        )}
      </Section>
    </div>
  );
}
