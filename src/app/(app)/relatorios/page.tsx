import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { MonthPicker } from "@/components/month-picker";
import { SearchParamSelect } from "@/components/search-param-select";
import { TabLinks } from "@/components/tab-links";
import { Card } from "@/components/ui/card";
import { getAvailableMonths } from "@/db/queries";
import { currentMonth, formatMonth, parseMonth } from "@/domain/month";
import { PERIODOS, parsePeriodo, periodMonths } from "@/domain/reports/period";
import { requireUserId } from "@/lib/auth";
import { CardSection } from "./card-section";
import { CategoriesSection } from "./categories-section";
import { ExpensesSection } from "./expenses-section";
import { InvestmentsSection } from "./investments-section";
import { OverviewSection } from "./overview-section";

const ABAS = [
  { id: "geral", label: "Visão geral" },
  { id: "categorias", label: "Categorias" },
  { id: "cartao", label: "Cartão" },
  { id: "lancamentos", label: "Lançamentos" },
  { id: "investimentos", label: "Investimentos" },
];

type Props = { searchParams: Promise<{ mes?: string; periodo?: string; aba?: string }> };

export default async function RelatoriosPage({ searchParams }: Props) {
  const userId = await requireUserId();
  const sp = await searchParams;
  const months = await getAvailableMonths(userId);

  if (!months.length) {
    return (
      <Card className="mx-auto max-w-lg items-center px-6 py-12 text-center">
        <span className="bg-brand grid size-14 place-items-center rounded-2xl text-white">
          <BarChart3 className="size-6" aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold">Relatórios</h1>
        <p className="max-w-sm text-muted-foreground">Importe um extrato para ver a evolução dos seus meses.</p>
        <Link href="/importar" className="bg-brand rounded-full px-5 py-2 font-semibold text-white">
          Importar extrato
        </Link>
      </Card>
    );
  }

  const today = currentMonth();
  const fim = parseMonth(sp.mes) ?? today;
  const periodo = parsePeriodo(sp.periodo);
  const meses = periodMonths(fim, periodo);
  const aba = ABAS.find((a) => a.id === sp.aba)?.id ?? "geral";
  const params = { mes: fim === today ? undefined : fim, periodo: periodo === 6 ? undefined : String(periodo) };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Relatórios</p>
          <h1 className="text-3xl font-semibold first-letter:uppercase">
            {formatMonth(meses[0])} a {formatMonth(fim)}
          </h1>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchParamSelect
            name="periodo"
            value={String(periodo)}
            options={PERIODOS.map((p) => ({ value: String(p), label: `Últimos ${p} meses` }))}
          />
          <MonthPicker value={fim} today={today} available={months} />
        </div>
      </div>

      <TabLinks tabs={ABAS} active={aba} basePath="/relatorios" params={params} />

      {aba === "geral" && <OverviewSection userId={userId} meses={meses} />}
      {aba === "categorias" && <CategoriesSection userId={userId} meses={meses} />}
      {aba === "cartao" && <CardSection userId={userId} meses={meses} />}
      {aba === "lancamentos" && <ExpensesSection userId={userId} meses={meses} />}
      {aba === "investimentos" && <InvestmentsSection userId={userId} meses={meses} />}
    </div>
  );
}
