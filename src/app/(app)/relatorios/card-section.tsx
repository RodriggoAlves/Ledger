import { CalendarClock, CreditCard, Layers } from "lucide-react";
import { MonthBars } from "@/components/charts";
import { Stat } from "@/components/stat";
import { db } from "@/db/client";
import { getUnpaidInstallments } from "@/db/reports";
import { formatBRL } from "@/domain/money";
import { currentMonth, formatMonth, monthKey, shortMonth, type MonthKey } from "@/domain/month";
import { futureCommitment, installmentMix } from "@/domain/reports/card";
import { StatusBadge } from "../cartao/status-badge";
import { loadPeriod } from "./data";
import { DataTable, Empty, pct, Section, Td } from "./ui";

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });

export async function CardSection({ userId, meses }: { userId: string; meses: MonthKey[] }) {
  const [rows, { periodo }] = await Promise.all([getUnpaidInstallments(db, userId, currentMonth()), loadPeriod(userId, meses)]);
  const futuro = futureCommitment(rows);
  const mix = installmentMix(periodo);
  const avista = mix.reduce((s, m) => s + m.avista, 0);
  const parcelado = mix.reduce((s, m) => s + m.parcelado, 0);
  const totalMix = avista + parcelado;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          icon={<CreditCard className="size-4" />}
          tone="expense"
          label="Já comprometido"
          value={formatBRL(futuro.total)}
          hint={`em ${futuro.faturas.length} ${futuro.faturas.length === 1 ? "fatura a pagar" : "faturas a pagar"}`}
        />
        <Stat
          icon={<CalendarClock className="size-4" />}
          tone="brand"
          label="Livre das parcelas"
          value={futuro.livreEm ? formatMonth(monthKey(futuro.livreEm)) : "Sem parcelas"}
          hint={futuro.livreEm ? `após a fatura que vence em ${day(futuro.livreEm)}` : "Nenhuma compra parcelada em aberto"}
        />
        <Stat
          icon={<Layers className="size-4" />}
          tone="expense"
          label="Parcelamentos ativos"
          value={String(futuro.parcelamentos.length)}
          hint={`${formatBRL(futuro.parcelamentos.reduce((s, p) => s + p.restante, 0))} ainda a pagar`}
        />
      </div>

      <Section
        title="Próximas faturas"
        description="Faturas ainda não pagas, pelo mês de vencimento. Projetadas só têm as parcelas já conhecidas."
      >
        {futuro.faturas.length === 0 ? (
          <Empty>Nenhuma fatura em aberto. Importe a fatura do cartão para ver as próximas.</Empty>
        ) : (
          <>
            <MonthBars
              stacked
              label="Valor comprometido em cada próxima fatura, dividido entre à vista e parcelado"
              data={futuro.faturas.map((f) => ({ label: shortMonth(monthKey(f.vencimento)), parcelado: f.parcelado, avista: f.avista }))}
              series={[
                { key: "parcelado", label: "Parcelas", color: "var(--series-1)" },
                { key: "avista", label: "À vista", color: "var(--series-2)" },
              ]}
            />
            <DataTable
              head={[
                { label: "Fatura" },
                { label: "Situação" },
                { label: "Parcelas", right: true },
                { label: "À vista", right: true },
                { label: "Total", right: true },
              ]}
            >
              {futuro.faturas.map((f) => (
                <tr key={f.mes}>
                  <Td>
                    <span className="capitalize">{formatMonth(monthKey(f.vencimento))}</span>
                    <span className="block text-xs text-muted-foreground">vence {day(f.vencimento)}</span>
                  </Td>
                  <Td>
                    <StatusBadge status={f.status} />
                  </Td>
                  <Td right>{formatBRL(f.parcelado)}</Td>
                  <Td right>{formatBRL(f.avista)}</Td>
                  <Td right className="font-semibold">
                    {formatBRL(f.total)}
                  </Td>
                </tr>
              ))}
            </DataTable>
          </>
        )}
      </Section>

      <Section title="Parcelamentos ativos" description="Compras parceladas com parcelas em faturas não pagas, das que acabam primeiro.">
        {futuro.parcelamentos.length === 0 ? (
          <Empty>Nenhuma compra parcelada em aberto.</Empty>
        ) : (
          <DataTable
            head={[
              { label: "Compra" },
              { label: "Próxima", right: true },
              { label: "Parcela", right: true },
              { label: "Restante", right: true },
              { label: "Última fatura", right: true },
            ]}
          >
            {futuro.parcelamentos.map((p) => (
              <tr key={p.purchaseId}>
                <Td className="max-w-56 truncate">{p.descricao}</Td>
                <Td right>
                  {p.proxima}/{p.parcelas}
                </Td>
                <Td right>{formatBRL(p.valorParcela)}</Td>
                <Td right className="font-semibold">
                  {formatBRL(p.restante)}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {p.restantes} {p.restantes === 1 ? "parcela" : "parcelas"}
                  </span>
                </Td>
                <Td right className="capitalize">
                  {formatMonth(monthKey(p.ultimoVencimento))}
                </Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>

      <Section
        title="À vista × parcelado"
        description={`Gasto no cartão em cada mês fechado do período. ${totalMix > 0 ? `${pct(Math.round((parcelado / totalMix) * 1000) / 10)} veio de parcelas.` : ""}`}
      >
        {mix.length === 0 ? (
          <Empty>Nenhum mês fechado neste período.</Empty>
        ) : (
          <>
            <MonthBars
              stacked
              label="Gasto no cartão por mês, à vista e parcelado"
              data={mix.map((m) => ({ label: shortMonth(m.mes), parcelado: m.parcelado, avista: m.avista }))}
              series={[
                { key: "parcelado", label: "Parcelas", color: "var(--series-1)" },
                { key: "avista", label: "À vista", color: "var(--series-2)" },
              ]}
            />
            <DataTable head={[{ label: "Mês" }, { label: "Parcelas", right: true }, { label: "À vista", right: true }, { label: "Total", right: true }]}>
              {mix.map((m) => (
                <tr key={m.mes}>
                  <Td className="capitalize">{formatMonth(m.mes)}</Td>
                  <Td right>{formatBRL(m.parcelado)}</Td>
                  <Td right>{formatBRL(m.avista)}</Td>
                  <Td right className="font-semibold">
                    {formatBRL(m.parcelado + m.avista)}
                  </Td>
                </tr>
              ))}
            </DataTable>
          </>
        )}
      </Section>
    </div>
  );
}
