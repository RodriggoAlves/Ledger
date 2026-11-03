import { ArrowDownLeft, ArrowUpRight, PiggyBank, Scale } from "lucide-react";
import Link from "next/link";
import { MonthBars } from "@/components/charts";
import { Stat } from "@/components/stat";
import { db } from "@/db/client";
import { getCofrinhoMovements } from "@/db/investments";
import { formatBRL } from "@/domain/money";
import { formatMonth, shortMonth, type MonthKey } from "@/domain/month";
import { monthlyEvolution, originSplit } from "@/domain/reports/evolution";
import { cofrinhoByMonth } from "@/domain/reports/investments";
import { loadPeriod } from "./data";
import { DataTable, pct, Section, Td } from "./ui";

export async function OverviewSection({ userId, meses }: { userId: string; meses: MonthKey[] }) {
  const [{ periodo, cats }, movs] = await Promise.all([loadPeriod(userId, meses), getCofrinhoMovements(db, userId)]);
  const { linhas, totais } = monthlyEvolution(periodo, cats, cofrinhoByMonth(movs));
  const split = originSplit(periodo);
  const conta = split.reduce((s, r) => s + r.conta, 0);
  const cartao = split.reduce((s, r) => s + r.cartao, 0);
  const meioTotal = conta + cartao;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<ArrowDownLeft className="size-4" />}
          tone="income"
          label="Entradas"
          value={formatBRL(totais.entradas)}
          hint={`média de ${formatBRL(Math.round(totais.entradas / meses.length))} por mês`}
        />
        <Stat
          icon={<ArrowUpRight className="size-4" />}
          tone="expense"
          label="Gastos"
          value={formatBRL(totais.gastos)}
          hint={`média de ${formatBRL(Math.round(totais.gastos / meses.length))} por mês`}
        />
        <Stat
          icon={<Scale className="size-4" />}
          tone="brand"
          label="Saldo do período"
          value={formatBRL(totais.saldo)}
          hint={totais.poupanca === null ? "Sem entradas no período" : `Você poupou ${pct(totais.poupanca)} do que entrou`}
        />
        <Stat
          icon={<PiggyBank className="size-4" />}
          tone="income"
          label="Para os cofrinhos"
          value={formatBRL(totais.cofrinhos)}
          hint="guardado − resgatado no período"
        />
      </div>

      <Section title="Entradas × gastos" description="Barras por mês; a linha mostra o saldo acumulado desde o início do período.">
        <MonthBars
          label="Entradas e gastos por mês, com saldo acumulado"
          data={linhas.map((l) => ({ label: shortMonth(l.mes), entradas: l.entradas, gastos: l.gastos, acumulado: l.saldoAcumulado }))}
          series={[
            { key: "entradas", label: "Entradas", color: "var(--series-1)" },
            { key: "gastos", label: "Gastos", color: "var(--series-2)" },
          ]}
          line={{ key: "acumulado", label: "Saldo acumulado", color: "var(--foreground)" }}
        />
        <DataTable
          head={[
            { label: "Mês" },
            { label: "Entradas", right: true },
            { label: "Gastos", right: true },
            { label: "Saldo", right: true },
            { label: "Poupança", right: true },
            { label: "Cofrinhos", right: true },
            { label: "Acumulado", right: true },
          ]}
        >
          {linhas.map((l) => (
            <tr key={l.mes}>
              <Td>
                <Link href={`/?mes=${l.mes}`} className="capitalize hover:underline">
                  {formatMonth(l.mes)}
                </Link>
              </Td>
              <Td right>{formatBRL(l.entradas)}</Td>
              <Td right>{formatBRL(l.gastos)}</Td>
              <Td right className="font-semibold">
                {formatBRL(l.saldo)}
              </Td>
              <Td right>{pct(l.poupanca)}</Td>
              <Td right>{formatBRL(l.cofrinhos)}</Td>
              <Td right>{formatBRL(l.saldoAcumulado)}</Td>
            </tr>
          ))}
        </DataTable>
      </Section>

      <Section title="Conta × cartão" description="Por onde saíram os gastos de cada mês.">
        <MonthBars
          stacked
          label="Gastos por mês divididos entre conta e cartão"
          data={split.map((r) => ({ label: shortMonth(r.mes), conta: r.conta, cartao: r.cartao }))}
          series={[
            { key: "conta", label: "Conta (Pix, débito, boletos)", color: "var(--series-1)" },
            { key: "cartao", label: "Cartão de crédito", color: "var(--series-2)" },
          ]}
        />
        <DataTable head={[{ label: "Meio" }, { label: "Total no período", right: true }, { label: "Parte", right: true }]}>
          <tr>
            <Td>Conta</Td>
            <Td right>{formatBRL(conta)}</Td>
            <Td right>{pct(meioTotal > 0 ? Math.round((conta / meioTotal) * 1000) / 10 : null)}</Td>
          </tr>
          <tr>
            <Td>Cartão</Td>
            <Td right>{formatBRL(cartao)}</Td>
            <Td right>{pct(meioTotal > 0 ? Math.round((cartao / meioTotal) * 1000) / 10 : null)}</Td>
          </tr>
        </DataTable>
      </Section>
    </div>
  );
}
