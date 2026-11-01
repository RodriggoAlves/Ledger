"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatBRL } from "@/domain/money";
import type { CategoryTotal } from "@/domain/summary";

export function CategoryDonut({ data }: { data: CategoryTotal[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Gráfico de gastos por categoria">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="total"
            nameKey="nome"
            innerRadius="60%"
            outerRadius="95%"
            paddingAngle={data.length > 1 ? 1 : 0}
            stroke="var(--background)"
            strokeWidth={2}
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
              borderRadius: 8,
              fontSize: 13,
            }}
            itemStyle={{ color: "var(--popover-foreground)" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
