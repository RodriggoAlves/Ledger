"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatBRL } from "@/domain/money";
import type { CategoryTotal } from "@/domain/summary";

export function CategoryDonut({ data, total }: { data: CategoryTotal[]; total: number }) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-72" role="img" aria-label="Gráfico de gastos por categoria">
      <div
        className="pointer-events-none absolute inset-[18%] rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--brand-from)_35%,transparent),transparent_70%)] blur-2xl"
        aria-hidden
      />
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="total"
            nameKey="nome"
            innerRadius="70%"
            outerRadius="98%"
            paddingAngle={data.length > 1 ? 2 : 0}
            cornerRadius={6}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((c) => (
              <Cell key={c.categoryId ?? "none"} fill={c.cor} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, _name, item) => [
              `${formatBRL(Number(value))} (${(item.payload as CategoryTotal).percentual}%)`,
              (item.payload as CategoryTotal).nome,
            ]}
            contentStyle={{
              background: "var(--popover)",
              color: "var(--popover-foreground)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              fontSize: 13,
              boxShadow: "0 12px 30px -12px rgb(0 0 0 / 0.6)",
            }}
            itemStyle={{ color: "var(--popover-foreground)" }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
        <span className="text-xs text-muted-foreground">Total gasto</span>
        <span className="font-display text-xl font-bold tabular-nums">{formatBRL(total)}</span>
      </div>
    </div>
  );
}
