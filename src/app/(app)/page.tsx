import { ArrowDownLeft, ArrowUpRight, Crown, Upload } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { db } from "@/db/client";
import { getInstallmentsForMonth } from "@/db/credit";
import { getAvailableMonths, getCategories, getTransactions } from "@/db/queries";
import { formatBRL } from "@/domain/money";
import { formatMonth, parseMonth } from "@/domain/month";
import { installmentsAsTxs, summarizeByCategory } from "@/domain/summary";
import { requireUserId } from "@/lib/auth";
import { CategoryDonut } from "./category-donut";
import { MonthPills } from "./month-pills";

type Props = { searchParams: Promise<{ mes?: string }> };

export default async function DashboardPage({ searchParams }: Props) {
  const userId = await requireUserId();
  const sp = await searchParams;
  const months = await getAvailableMonths(userId);

  if (!months.length) {
    return (
      <Card className="mx-auto max-w-lg items-center px-6 py-12 text-center">
        <span className="bg-brand grid size-14 place-items-center rounded-2xl text-white shadow-[0_10px_30px_-10px_var(--brand-from)]">
          <Upload className="size-6" aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold">Comece pelo seu extrato</h1>
        <p className="max-w-sm text-muted-foreground">
          Importe o CSV do PicPay para ver para onde vai o seu dinheiro, mês a mês.
        </p>
        <Link href="/importar" className="bg-brand rounded-full px-5 py-2 font-semibold text-white">
          Importar extrato
        </Link>
      </Card>
    );
  }

  const month = parseMonth(sp.mes) ?? months[0];
  const [txs, categories, parcelas] = await Promise.all([
    getTransactions(userId, { month }),
    getCategories(userId),
    getInstallmentsForMonth(db, userId, month),
  ]);
  const summary = summarizeByCategory([...txs, ...installmentsAsTxs(parcelas)], categories);
  const entradas = txs.filter((t) => t.tipo === "RECEITA");
  const receitas = entradas.reduce((s, t) => s + t.valor, 0);
  const gastos = summary.reduce((s, c) => s + c.total, 0);
  const saldo = receitas - gastos;
  const usado = receitas > 0 ? Math.min(100, Math.round((gastos / receitas) * 100)) : gastos > 0 ? 100 : 0;
  const top = summary[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Resumo do mês</p>
          <h1 className="text-3xl font-semibold capitalize">{formatMonth(month)}</h1>
        </div>
        <MonthPills months={months} current={month} />
      </div>

      <section className="aurora relative overflow-hidden rounded-3xl p-6 text-white shadow-[0_30px_70px_-35px_var(--brand-to)] sm:p-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-15 [background-image:radial-gradient(rgb(255_255_255/0.9)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
          aria-hidden
        />
        <div className="relative grid gap-8 md:grid-cols-[1.3fr_1fr] md:items-end">
          <div>
            <p className="text-sm text-white/75">Saldo do mês</p>
            <p className="mt-1 font-display text-5xl font-bold tracking-tight tabular-nums sm:text-6xl">
              {formatBRL(saldo)}
            </p>
            <p className="mt-3 text-sm text-white/80">
              {receitas > 0 ? `Você gastou ${usado}% do que entrou neste mês.` : "Nenhuma entrada registrada neste mês."}
            </p>
          </div>
          <div className="space-y-3">
            <div
              className="h-2.5 overflow-hidden rounded-full bg-white/20"
              role="img"
              aria-label={`${usado}% das entradas foram gastos`}
            >
              <div
                className="h-full rounded-full bg-white shadow-[0_0_16px_rgb(255_255_255/0.7)]"
                style={{ width: `${usado}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <HeroFigure icon={<ArrowDownLeft className="size-3.5" aria-hidden />} label="Entradas" value={receitas} />
              <HeroFigure icon={<ArrowUpRight className="size-3.5" aria-hidden />} label="Gastos" value={gastos} />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          icon={<ArrowDownLeft className="size-4" />}
          tone="income"
          label="Entradas"
          value={formatBRL(receitas)}
          hint={`${entradas.length} ${entradas.length === 1 ? "recebimento" : "recebimentos"}`}
        />
        <Stat
          icon={<ArrowUpRight className="size-4" />}
          tone="expense"
          label="Gastos"
          value={formatBRL(gastos)}
          hint={`em ${summary.length} ${summary.length === 1 ? "categoria" : "categorias"}`}
        />
        <Stat
          icon={<Crown className="size-4" />}
          tone="brand"
          label="Onde mais gastou"
          value={top ? top.nome : "Nada ainda"}
          hint={top ? `${formatBRL(top.total)}, ${top.percentual}% dos gastos` : "Sem gastos no mês"}
        />
      </div>

      <Card className="gap-6">
        <div className="flex items-baseline justify-between px-(--card-spacing)">
          <h2 className="text-lg font-semibold">Gastos por categoria</h2>
          <Link href={`/transacoes?mes=${month}&tipo=GASTO`} className="text-sm text-primary hover:underline">
            Ver transações
          </Link>
        </div>
        <div className="px-(--card-spacing)">
          {summary.length === 0 ? (
            <p className="text-muted-foreground">
              Nenhum gasto neste mês.{" "}
              <Link href="/importar" className="text-primary underline">
                Importe um extrato
              </Link>
              .
            </p>
          ) : (
            <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <CategoryDonut data={summary} total={gastos} />
              <ul className="space-y-1">
                {summary.map((c) => (
                  <li key={c.categoryId ?? "none"}>
                    <Link
                      href={`/transacoes?mes=${month}&categoria=${c.categoryId ?? "none"}&tipo=GASTO`}
                      className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="flex items-center gap-3">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: c.cor, boxShadow: `0 0 10px ${c.cor}` }}
                          aria-hidden
                        />
                        <span className="flex-1 truncate font-medium">{c.nome}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{c.percentual}%</span>
                        <span className="w-28 text-right font-display text-sm font-semibold tabular-nums">
                          {formatBRL(c.total)}
                        </span>
                      </span>
                      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${(c.total / top.total) * 100}%`,
                            background: `linear-gradient(90deg, color-mix(in srgb, ${c.cor} 40%, transparent), ${c.cor})`,
                          }}
                        />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function HeroFigure({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white/12 p-3 ring-1 ring-white/20 backdrop-blur">
      <p className="flex items-center gap-1.5 text-xs text-white/75">
        {icon} {label}
      </p>
      <p className="mt-1 font-display font-semibold tabular-nums">{formatBRL(value)}</p>
    </div>
  );
}

const TONES = {
  income: "bg-[color-mix(in_srgb,var(--income)_16%,transparent)] text-income",
  expense: "bg-[color-mix(in_srgb,var(--expense)_16%,transparent)] text-expense",
  brand: "bg-brand text-white",
};

function Stat({
  icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  tone: keyof typeof TONES;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card size="sm" className="gap-3 px-(--card-spacing)">
      <div className="flex items-center gap-2.5">
        <span className={`grid size-8 place-items-center rounded-xl ${TONES[tone]}`} aria-hidden>
          {icon}
        </span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="truncate font-display text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}
