"use client";

import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL } from "@/domain/money";

/** Uma série do gráfico: chave no dado, nome na legenda e cor (token CSS ou cor da categoria). */
export type Series = { key: string; label: string; color: string };
export type ChartRow = { label: string } & Record<string, number | string>;

const COMPACT = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const axisMoney = (cents: number) => COMPACT.format(cents / 100);

const tooltipProps = {
  formatter: (value: unknown, name: unknown) => [formatBRL(Number(value)), String(name)] as [string, string],
  contentStyle: {
    background: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    fontSize: 13,
    boxShadow: "0 12px 30px -12px rgb(0 0 0 / 0.6)",
  },
  itemStyle: { color: "var(--popover-foreground)" },
  labelStyle: { color: "var(--muted-foreground)", marginBottom: 4 },
  cursor: { fill: "color-mix(in srgb, var(--foreground) 6%, transparent)" },
};

const axisProps = {
  tick: { fill: "var(--muted-foreground)", fontSize: 12 },
  tickLine: false,
  axisLine: false,
};

/** Legenda em HTML com as cores das séries; o texto fica na cor de texto. */
export function ChartLegend({ series, line }: { series: Series[]; line?: Series }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
      {line && (
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-3.5 rounded-full" style={{ background: line.color }} aria-hidden />
          {line.label}
        </li>
      )}
    </ul>
  );
}

/**
 * Barras por mês (agrupadas ou empilhadas), com linha opcional na mesma escala (sempre R$).
 * `label` descreve o gráfico para leitores de tela; a tabela ao lado traz os números.
 */
export function MonthBars({
  data,
  series,
  stacked = false,
  line,
  label,
  height = 260,
}: {
  data: ChartRow[];
  series: Series[];
  stacked?: boolean;
  line?: Series;
  label: string;
  height?: number;
}) {
  return (
    <div className="space-y-3">
      <ChartLegend series={series} line={line} />
      <div role="img" aria-label={label} style={{ height }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis tickFormatter={axisMoney} width={72} {...axisProps} />
            <Tooltip {...tooltipProps} />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                stackId={stacked ? "s" : undefined}
                radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : 0}
                stroke={stacked ? "var(--card)" : undefined}
                strokeWidth={stacked ? 1 : 0}
                maxBarSize={stacked ? 44 : 28}
                isAnimationActive={false}
              />
            ))}
            {line && (
              <Line
                dataKey={line.key}
                name={line.label}
                stroke={line.color}
                strokeWidth={2}
                dot={{ r: 3, fill: line.color, stroke: "var(--card)", strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Áreas empilhadas (ex.: aportado + rendimento = saldo) ao longo do tempo. */
export function StackedArea({
  data,
  series,
  label,
  height = 260,
}: {
  data: ChartRow[];
  series: Series[];
  label: string;
  height?: number;
}) {
  return (
    <div className="space-y-3">
      <ChartLegend series={series} />
      <div role="img" aria-label={label} style={{ height }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="label" {...axisProps} minTickGap={16} />
            <YAxis tickFormatter={axisMoney} width={72} {...axisProps} />
            <Tooltip {...tooltipProps} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} />
            {series.map((s) => (
              <Area
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="a"
                type="monotone"
                stroke={s.color}
                strokeWidth={2}
                fill={s.color}
                fillOpacity={0.25}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
