import { ArrowDownLeft, ArrowUpRight, CreditCard, Crown, Upload } from "lucide-react";
import Link from "next/link";
import { ImportLink } from "@/components/import-link";
import { MonthPicker } from "@/components/month-picker";
import { Stat } from "@/components/stat";
import { Card } from "@/components/ui/card";
import { db } from "@/db/client";
import { getInvoiceForMonth } from "@/db/credit";
import { getMonthEntries } from "@/db/entries";
import { getAvailableMonths, getCategories } from "@/db/queries";
import { entriesTotal, filterEntries } from "@/domain/entries";
import { invoiceCard } from "@/domain/invoice-card";
import { formatBRL } from "@/domain/money";
import { currentMonth, formatMonth, parseMonth } from "@/domain/month";
import { summarizeSpending } from "@/domain/summary";
import { transactionsHref } from "@/domain/transactions-link";
import { countsAsExpense } from "@/domain/tx-type";
import { requireUserId } from "@/lib/auth";
import { CategoryDonut } from "./category-donut";

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

  const today = currentMonth();
  const month = parseMonth(sp.mes) ?? today;
  // Uma lista só (extrato + parcelas da fatura que fecha no mês) para todos os números da página.
  const [entries, categories, fatura] = await Promise.all([
    getMonthEntries(db, userId, month),
    getCategories(userId),
    getInvoiceForMonth(db, userId, month),
  ]);
  const resumo = summarizeSpending(entries, categories);
  const entradas = entries.filter((e) => e.tipo === "RECEITA");
  const receitas = entradas.reduce((s, e) => s + e.valor, 0);
  const gastos = resumo.total;
  const saldo = receitas - gastos;
  // Créditos podem deixar os gastos negativos; a barra não passa de 0–100%.
  const usado = receitas > 0 ? Math.max(0, Math.min(100, Math.round((gastos / receitas) * 100))) : gastos > 0 ? 100 : 0;
  const top = resumo.categorias[0];
  const cartao = invoiceCard(fatura, -entriesTotal(filterEntries(entries, { origem: "CARTAO" })), month);
  // Cada card abre em Transações a lista que soma o seu valor; sem nada a listar, não é clicável.
  const gastosHref = transactionsHref(month, { tipo: "GASTO" });
  const entradasLink = entradas.length ? transactionsHref(month, { tipo: "RECEITA" }) : null;
  const gastosLink = entries.some((e) => countsAsExpense(e.tipo)) ? gastosHref : null;
  const topLink = top ? transactionsHref(month, { categoryId: top.categoryId ?? "none", tipo: "GASTO" }) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Resumo do mês</p>
          <h1 className="text-3xl font-semibold capitalize">{formatMonth(month)}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImportLink />
          <MonthPicker value={month} today={today} available={months} />
        </div>
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
              <HeroFigure
                icon={<ArrowDownLeft className="size-3.5" aria-hidden />}
                label="Entradas"
                value={receitas}
                href={entradasLink}
              />
              <HeroFigure
                icon={<ArrowUpRight className="size-3.5" aria-hidden />}
                label="Gastos"
                value={gastos}
                href={gastosLink}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<ArrowDownLeft className="size-4" />}
          tone="income"
          label="Entradas"
          value={formatBRL(receitas)}
          hint={`${entradas.length} ${entradas.length === 1 ? "recebimento" : "recebimentos"}`}
          href={entradasLink}
        />
        <Stat
          icon={<ArrowUpRight className="size-4" />}
          tone="expense"
          label="Gastos"
          value={formatBRL(gastos)}
          hint={`em ${resumo.categorias.length} ${resumo.categorias.length === 1 ? "categoria" : "categorias"}`}
          href={gastosLink}
        />
        <Stat
          icon={<CreditCard className="size-4" />}
          tone="expense"
          label="Fatura do cartão"
          value={cartao.value}
          hint={cartao.hint}
          href={cartao.href}
        />
        <Stat
          icon={<Crown className="size-4" />}
          tone="brand"
          label="Onde mais gastou"
          value={top ? top.nome : "Nada ainda"}
          hint={top ? `${formatBRL(top.total)}, ${top.percentual}% dos gastos` : "Sem gastos no mês"}
          href={topLink}
        />
      </div>

      <Card className="gap-6">
        <div className="flex items-baseline justify-between px-(--card-spacing)">
          <h2 className="text-lg font-semibold">Gastos por categoria</h2>
          <Link href={gastosHref} className="text-sm text-primary hover:underline">
            Ver transações
          </Link>
        </div>
        <div className="px-(--card-spacing)">
          {resumo.categorias.length === 0 && resumo.creditos === 0 ? (
            <p className="text-muted-foreground">
              Nenhum gasto neste mês.{" "}
              <Link href="/importar" className="text-primary underline">
                Importe um extrato
              </Link>
              .
            </p>
          ) : (
            <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              {resumo.categorias.length > 0 && <CategoryDonut data={resumo.categorias} total={gastos} />}
              <ul className="space-y-1">
                {resumo.categorias.map((c) => (
                  <li key={c.categoryId ?? "none"}>
                    <Link
                      href={transactionsHref(month, { categoryId: c.categoryId ?? "none", tipo: "GASTO" })}
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
                {resumo.creditos < 0 && (
                  <li className="flex items-center gap-3 px-3 py-2.5 text-muted-foreground">
                    <span className="size-2.5 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
                    <span className="flex-1 truncate font-medium">Créditos e estornos</span>
                    <span className="w-28 text-right font-display text-sm font-semibold tabular-nums">
                      {formatBRL(resumo.creditos)}
                    </span>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function HeroFigure({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  /** Com link, o quadrinho inteiro é clicável. */
  href?: string | null;
}) {
  const box = "rounded-2xl bg-white/12 p-3 ring-1 ring-white/20 backdrop-blur";
  const content = (
    <>
      <p className="flex items-center gap-1.5 text-xs text-white/75">
        {icon} {label}
      </p>
      <p className="mt-1 font-display font-semibold tabular-nums">{formatBRL(value)}</p>
    </>
  );
  return href ? (
    <Link
      href={href}
      className={`block ${box} transition-shadow hover:ring-white/50 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none`}
    >
      {content}
    </Link>
  ) : (
    <div className={box}>{content}</div>
  );
}
