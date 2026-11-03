import { Coins, PiggyBank, TrendingUp } from "lucide-react";
import Link from "next/link";
import { MonthBars } from "@/components/charts";
import { Stat } from "@/components/stat";
import { db } from "@/db/client";
import { getCdi } from "@/db/cdi";
import { getInvestmentData } from "@/db/investments";
import { formatBRL } from "@/domain/money";
import { formatMonth, shortMonth, todayDate, type MonthKey } from "@/domain/month";
import { investmentsInPeriod } from "@/domain/reports/investments";
import { DataTable, Empty, Section, Td } from "./ui";

export async function InvestmentsSection({ userId, meses }: { userId: string; meses: MonthKey[] }) {
  const [invs, cdi] = await Promise.all([getInvestmentData(db, userId), getCdi(db, userId)]);

  if (!invs.length) {
    return (
      <Section title="Investimentos">
        <Empty>
          Nenhum cofrinho nos extratos importados. Quando houver &ldquo;Dinheiro guardado&rdquo; no extrato, ele aparece aqui e em{" "}
          <Link href="/investimentos" className="text-primary underline">
            Investimentos
          </Link>
          .
        </Empty>
      </Section>
    );
  }

  const r = investmentsInPeriod({
    meses,
    investimentos: invs.map((i) => ({ movs: i.movs, snaps: i.snaps, rates: { cdiAnual: cdi.taxaAnual, percentual: i.percentualCdi } })),
    hoje: todayDate(),
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          icon={<PiggyBank className="size-4" />}
          tone="brand"
          label="Saldo estimado hoje"
          value={formatBRL(r.saldoHoje)}
          hint={`${invs.length} ${invs.length === 1 ? "cofrinho" : "cofrinhos"}`}
          href="/investimentos"
        />
        <Stat
          icon={<Coins className="size-4" />}
          tone="income"
          label="Guardado no período"
          value={formatBRL(r.aportado)}
          hint="aportes − resgates"
        />
        <Stat
          icon={<TrendingUp className="size-4" />}
          tone="income"
          label="Rendimento estimado"
          value={formatBRL(r.rendimento)}
          hint="no período, bruto de IR"
        />
      </div>

      <Section
        title="Saldo nos cofrinhos"
        description="Estimado no último dia de cada mês com o CDI atual; os saldos reais informados corrigem a estimativa."
        action={
          <Link href="/investimentos" className="shrink-0 text-sm text-primary hover:underline">
            Ver cofrinhos
          </Link>
        }
      >
        <MonthBars
          label="Saldo estimado nos cofrinhos no fim de cada mês"
          data={r.linhas.map((l) => ({ label: shortMonth(l.mes), saldo: l.saldo }))}
          series={[{ key: "saldo", label: "Saldo estimado", color: "var(--series-3)" }]}
        />
        <DataTable head={[{ label: "Mês" }, { label: "Aportes", right: true }, { label: "Resgates", right: true }, { label: "Saldo estimado", right: true }]}>
          {r.linhas.map((l) => (
            <tr key={l.mes}>
              <Td className="capitalize">{formatMonth(l.mes)}</Td>
              <Td right>{formatBRL(l.aportes)}</Td>
              <Td right>{formatBRL(l.resgates)}</Td>
              <Td right className="font-semibold">
                {formatBRL(l.saldo)}
              </Td>
            </tr>
          ))}
        </DataTable>
      </Section>
    </div>
  );
}
