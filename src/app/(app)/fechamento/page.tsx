import Link from "next/link";
import { MonthPicker } from "@/components/month-picker";
import { RuleOfferProvider } from "@/components/rule-offer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db/client";
import { getClosings } from "@/db/closings";
import { getInvoiceForMonth } from "@/db/credit";
import { getMonthEntries } from "@/db/entries";
import { getAvailableMonths, getCategories } from "@/db/queries";
import { getNomeExtrato } from "@/db/settings";
import { closingSteps, monthStatus, pendingCount, type MonthStatus } from "@/domain/closing";
import { addMonths } from "@/domain/invoice";
import { formatBRL } from "@/domain/money";
import { currentMonth, formatMonth, parseMonth } from "@/domain/month";
import { summarizeSpending } from "@/domain/summary";
import { requireUserId } from "@/lib/auth";
import { NOME_EXTRATO_AJUDA } from "@/domain/titular";
import { NomeExtratoForm } from "../configuracoes/nome-extrato-section";
import { toRowData } from "../transacoes/row-data";
import { CloseButtons } from "./close-buttons";
import { StepEntries } from "./step-entries";
import { TitularStep } from "./titular-step";

type Props = { searchParams: Promise<{ mes?: string }> };

const dia = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });

const FATURA_LABEL = { PAGA: "Importada (paga)", FECHADA: "Importada", PROJETADA: "Projetada (ainda não importada)" } as const;

function statusLabel(status: MonthStatus, fechadoEm: Date | undefined): string {
  if (status === "ABERTO") return "Aberto";
  if (status === "ALTERADO") return "Alterado depois do fechamento";
  return `Fechado em ${fechadoEm?.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })}`;
}

function Step({ n, title, children, ok }: { n: number; title: string; children?: React.ReactNode; ok?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {n}. {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{ok ? <p className="text-muted-foreground">Tudo certo.</p> : children}</CardContent>
    </Card>
  );
}

export default async function FechamentoPage({ searchParams }: Props) {
  const userId = await requireUserId();
  const sp = await searchParams;
  const today = currentMonth();
  const mes = parseMonth(sp.mes) ?? addMonths(today, -1);

  const [months, categories, entries, closings, nome, fatura] = await Promise.all([
    getAvailableMonths(userId),
    getCategories(userId),
    getMonthEntries(db, userId, mes),
    getClosings(db, userId, [mes]),
    getNomeExtrato(db, userId),
    getInvoiceForMonth(db, userId, mes),
  ]);
  const closing = closings.get(mes);
  const status = monthStatus(closing, entries);
  const steps = closingSteps(entries, nome);
  const pend = pendingCount(steps);

  const conta = entries.filter((e) => e.origem === "CONTA");
  const ultimo = conta.reduce<Date | null>((max, e) => (!max || e.data > max ? e.data : max), null);
  const receitas = entries.filter((e) => e.tipo === "RECEITA").reduce((s, e) => s + e.valor, 0);
  const gastos = summarizeSpending(entries, categories).total;
  const receitaOptions = categories.filter((c) => c.tipo === "RECEITA").map((c) => ({ value: c.id, label: c.nome }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{statusLabel(status, closing?.fechadoEm)}</p>
          <h1 className="text-3xl font-semibold first-letter:uppercase">Fechamento de {formatMonth(mes)}</h1>
        </div>
        <MonthPicker value={mes} today={today} available={months.length ? months : [mes]} defaultMonth={addMonths(today, -1)} />
      </div>

      <Step n={1} title="Importações">
        <p>{ultimo ? `Último lançamento do extrato: ${dia(ultimo)}` : "Nenhum lançamento do extrato neste mês"}</p>
        <p>Fatura do cartão que fecha no mês: {fatura ? FATURA_LABEL[fatura.status] : "Sem fatura"}</p>
        <p className="text-muted-foreground">
          <Link href="/importar" className="underline">
            Importar extrato
          </Link>{" "}
          ·{" "}
          <Link href="/cartao" className="underline">
            Faturas do cartão
          </Link>
        </p>
      </Step>

      <Step n={2} title="Pix entre suas contas e renda">
        {!nome ? (
          <>
            <p className="text-muted-foreground">Informe seu nome como aparece no extrato. {NOME_EXTRATO_AJUDA}</p>
            <NomeExtratoForm initial={null} />
          </>
        ) : steps.titular.length === 0 ? (
          <p className="text-muted-foreground">Nenhum Pix entre suas contas neste mês.</p>
        ) : (
          <>
            <p className="text-muted-foreground">Diga o que foi cada Pix: salário, férias… ou só transferência.</p>
            <TitularStep
              rows={steps.titular.map((e) => ({ id: e.id, data: e.data.toISOString(), valor: e.valor, tipo: e.tipo, categoryId: e.categoryId }))}
              receitas={receitaOptions}
            />
          </>
        )}
        <p className="font-medium">Renda do mês: {formatBRL(receitas)}</p>
      </Step>

      <RuleOfferProvider>
        <div className="space-y-6">
          <StepEntries
            n={3}
            title="Entradas"
            pendentes={steps.entradas.map(toRowData)}
            todas={steps.todasEntradas.map(toRowData)}
            categories={categories}
            vazio="Nenhuma entrada no extrato neste mês."
          />
          <StepEntries
            n={4}
            title="Gastos"
            pendentes={steps.gastos.map(toRowData)}
            todas={steps.todosGastos.map(toRowData)}
            categories={categories}
            vazio="Nenhum gasto neste mês."
          />
        </div>
      </RuleOfferProvider>

      <Step n={5} title="Resumo">
        <dl className="grid grid-cols-3 gap-3 tabular-nums">
          <div>
            <dt className="text-muted-foreground">Entradas</dt>
            <dd className="text-lg font-semibold">{formatBRL(receitas)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Gastos</dt>
            <dd className="text-lg font-semibold">{formatBRL(gastos)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Saldo</dt>
            <dd className="text-lg font-semibold">{formatBRL(receitas - gastos)}</dd>
          </div>
        </dl>
        <p className="text-muted-foreground">
          {pend.total === 0 ? "Nenhuma pendência." : `${pend.total} ${pend.total === 1 ? "pendência" : "pendências"}.`}
        </p>
        <CloseButtons mes={mes} status={status} pendencias={pend.total} />
      </Step>
    </div>
  );
}
