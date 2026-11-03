import { Landmark, PiggyBank, TrendingUp, Wallet } from "lucide-react";
import { Stat } from "@/components/stat";
import { TabLinks } from "@/components/tab-links";
import { Card } from "@/components/ui/card";
import { db } from "@/db/client";
import { getCdi } from "@/db/cdi";
import { getInvestmentData } from "@/db/investments";
import { formatPercent, type Cdi } from "@/domain/cdi";
import { buildLots, compareSnapshots, position, project, type Movement, type Rates, type Snapshot } from "@/domain/investments";
import { formatBRL } from "@/domain/money";
import { todayDate } from "@/domain/month";
import { requireUserId } from "@/lib/auth";
import { DataTable, Section, Td } from "../relatorios/ui";
import { CdiForm, DeleteSnapshotButton, PercentForm, SnapshotForm } from "./forms";
import { Simulator } from "./simulator";

const ABAS = [
  { id: "cofrinhos", label: "Cofrinhos" },
  { id: "simulador", label: "Simulador" },
];

const PRAZOS = [1, 3, 6, 12];

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
const iso = (d: Date) => d.toISOString().slice(0, 10);

type Props = { searchParams: Promise<{ aba?: string }> };

export default async function InvestimentosPage({ searchParams }: Props) {
  const userId = await requireUserId();
  const sp = await searchParams;
  const aba = sp.aba === "simulador" ? "simulador" : "cofrinhos";
  const [invs, cdi] = await Promise.all([aba === "cofrinhos" ? getInvestmentData(db, userId) : Promise.resolve([]), getCdi(db, userId)]);
  const hoje = todayDate();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Investimentos</p>
        <h1 className="text-3xl font-semibold">Seus cofrinhos</h1>
      </div>

      <TabLinks tabs={ABAS} active={aba} basePath="/investimentos" params={{}} />

      <CdiCard cdi={cdi} />

      {aba === "simulador" ? (
        <Simulator cdiAnual={cdi.taxaAnual} />
      ) : invs.length === 0 ? (
        <Card className="items-center px-6 py-10 text-center">
          <PiggyBank className="size-8 text-primary" aria-hidden />
          <p className="font-semibold">Nenhum cofrinho nos extratos importados</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Quando o extrato do PicPay tiver &ldquo;Dinheiro guardado&rdquo; em um cofrinho, ele aparece aqui automaticamente. Enquanto
            isso, use o Simulador.
          </p>
        </Card>
      ) : (
        <Cofrinhos invs={invs} cdi={cdi} hoje={hoje} />
      )}
    </div>
  );
}

const FONTE: Record<Cdi["fonte"], (c: Cdi) => string> = {
  BCB: (c) => `Banco Central, taxa de ${c.data!.split("-").reverse().join("/")}`,
  MANUAL: () => "Informado por você",
  PADRAO: () => "Padrão: não foi possível consultar o Banco Central. Informe a taxa atual.",
};

function CdiCard({ cdi }: { cdi: Cdi }) {
  return (
    <Card size="sm" className="gap-3 px-(--card-spacing) sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-primary" aria-hidden>
          <Landmark className="size-4" />
        </span>
        <div>
          <p className="font-semibold">
            CDI em uso: <span className="tabular-nums">{formatPercent(cdi.taxaAnual)}</span> ao ano
          </p>
          <p className={cdi.fonte === "PADRAO" ? "text-xs text-expense" : "text-xs text-muted-foreground"}>{FONTE[cdi.fonte](cdi)}</p>
        </div>
      </div>
      <CdiForm taxaAnual={cdi.taxaAnual} manual={cdi.fonte === "MANUAL"} />
    </Card>
  );
}

type Inv = { id: string; nome: string; percentualCdi: number; movs: Movement[]; snaps: (Snapshot & { id: string })[] };

function Cofrinhos({ invs, cdi, hoje }: { invs: Inv[]; cdi: Cdi; hoje: Date }) {
  const calc = invs.map((inv) => {
    const rates: Rates = { cdiAnual: cdi.taxaAnual, percentual: inv.percentualCdi };
    const lots = buildLots(inv.movs, inv.snaps, rates, hoje);
    return { inv, rates, lots, pos: position(lots, hoje) };
  });
  const bruto = calc.reduce((s, c) => s + c.pos.bruto, 0);
  const liquido = calc.reduce((s, c) => s + c.pos.liquido, 0);
  const rendimento = calc.reduce((s, c) => s + c.pos.rendimento, 0);

  return (
    <div className="space-y-6">
      {invs.length > 1 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat icon={<Wallet className="size-4" />} tone="brand" label="Total estimado" value={formatBRL(bruto)} hint="bruto, todos os cofrinhos" />
          <Stat icon={<PiggyBank className="size-4" />} tone="income" label="Líquido de IR" value={formatBRL(liquido)} hint="se resgatasse tudo hoje" />
          <Stat icon={<TrendingUp className="size-4" />} tone="income" label="Rendimento estimado" value={formatBRL(rendimento)} hint="bruto, sobre o aportado" />
        </div>
      )}
      {calc.map((c) => (
        <CofrinhoCard key={c.inv.id} {...c} hoje={hoje} />
      ))}
    </div>
  );
}

function CofrinhoCard({
  inv,
  rates,
  lots,
  pos,
  hoje,
}: {
  inv: Inv;
  rates: Rates;
  lots: ReturnType<typeof buildLots>;
  pos: ReturnType<typeof position>;
  hoje: Date;
}) {
  const movimentado = inv.movs.reduce((s, m) => s + m.valor, 0);
  const ultimo = inv.snaps[inv.snaps.length - 1];
  const comparacoes = compareSnapshots(inv.movs, inv.snaps, rates).reverse();

  return (
    <Section
      title={inv.nome}
      description={`${inv.movs.length} ${inv.movs.length === 1 ? "movimento" : "movimentos"} no extrato · ${formatPercent(inv.percentualCdi, 0)} do CDI`}
      action={<PercentForm id={inv.id} percentual={inv.percentualCdi} />}
    >
      {inv.snaps.length === 0 && (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--series-2)_12%,transparent)] p-3 text-sm ring-1 ring-[color-mix(in_srgb,var(--series-2)_35%,transparent)]">
          <strong>Informe o saldo real.</strong> Sem ele, a estimativa só conhece os movimentos dos extratos importados e não sabe o
          que já havia no cofrinho antes deles.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Saldo estimado hoje" value={formatBRL(pos.bruto)} hint="bruto" />
        <Figure label="Líquido de IR" value={formatBRL(pos.liquido)} hint={`IR estimado: ${formatBRL(pos.ir)}`} />
        <Figure label="Guardado − resgatado" value={formatBRL(movimentado)} hint="pelos extratos importados" />
        <Figure
          label="Último saldo real"
          value={ultimo ? formatBRL(ultimo.saldo) : "—"}
          hint={ultimo ? `informado para ${day(ultimo.data)}` : "Informe para corrigir a estimativa"}
        />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Projeção sem novos aportes</h3>
        <DataTable head={[{ label: "Prazo" }, { label: "Saldo bruto", right: true }, { label: "Rendimento", right: true }, { label: "Líquido de IR", right: true }]}>
          {PRAZOS.map((m) => {
            const p = project(lots, hoje, m, rates);
            return (
              <tr key={m}>
                <Td>
                  {m} {m === 1 ? "mês" : "meses"}
                </Td>
                <Td right>{formatBRL(p.bruto)}</Td>
                <Td right>{formatBRL(p.bruto - pos.bruto)}</Td>
                <Td right className="font-semibold">
                  {formatBRL(p.liquido)}
                </Td>
              </tr>
            );
          })}
        </DataTable>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Saldo real</h3>
        <p className="text-sm text-muted-foreground">
          Informe o saldo que aparece no app do PicPay. A estimativa passa a partir dele, e com dois ou mais saldos o app compara o rendimento real com o esperado.
        </p>
        <SnapshotForm investmentId={inv.id} hoje={iso(hoje)} />
        {comparacoes.length > 0 && (
          <DataTable
            head={[
              { label: "Período" },
              { label: "Movimentos", right: true },
              { label: "Rendeu", right: true },
              { label: "Esperado", right: true },
              { label: "Taxa efetiva", right: true },
            ]}
          >
            {comparacoes.map((c) => (
              <tr key={c.ate.toISOString()}>
                <Td className="whitespace-nowrap">
                  {day(c.de)} → {day(c.ate)}
                  <span className="block text-xs text-muted-foreground">
                    {formatBRL(c.saldoInicial)} → {formatBRL(c.saldoFinal)}
                  </span>
                </Td>
                <Td right>{formatBRL(c.movimentos)}</Td>
                <Td right className="font-semibold">
                  {formatBRL(c.rendimentoReal)}
                </Td>
                <Td right>{formatBRL(c.rendimentoEsperado)}</Td>
                <Td right>{c.taxaEfetiva === null ? "—" : `${formatPercent(c.taxaEfetiva, 0)} do CDI`}</Td>
              </tr>
            ))}
          </DataTable>
        )}
        {inv.snaps.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {[...inv.snaps].reverse().map((s) => (
              <li key={s.id} className="flex items-center gap-1 rounded-full bg-muted py-0.5 pr-0.5 pl-3 text-xs">
                <span className="tabular-nums">
                  {day(s.data)}: {formatBRL(s.saldo)}
                </span>
                <DeleteSnapshotButton id={s.id} label={day(s.data)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-3 ring-1 ring-border/60">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
