import { currentMonth, parseMonth } from "@/domain/month";
import { entriesToCsv } from "@/domain/reports/csv";
import { parsePeriodo, periodMonths } from "@/domain/reports/period";
import { requireUserId } from "@/lib/auth";
import { loadPeriod } from "../data";

/** CSV com os lançamentos do período (mesmos parâmetros da página de Relatórios). */
export async function GET(request: Request) {
  const userId = await requireUserId();
  const sp = new URL(request.url).searchParams;
  const fim = parseMonth(sp.get("mes")) ?? currentMonth();
  const meses = periodMonths(fim, parsePeriodo(sp.get("periodo") ?? undefined));
  const { periodo, cats } = await loadPeriod(userId, meses);
  return new Response(entriesToCsv(periodo, cats), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ledger-${meses[0]}-a-${fim}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
