import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "cn";

/** 60 → "60%"; 33.3 → "33,3%"; null → "—". */
export function pct(n: number | null): string {
  return n === null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/**
 * Variação com seta e sinal (nunca só cor). `bom` diz qual direção é boa:
 * para gastos, cair é bom; para receitas, subir é bom.
 */
export function Variation({ value, bom }: { value: number | null; bom: "subir" | "cair" }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  if (value === 0) return <span className="text-muted-foreground">0%</span>;
  const up = value > 0;
  const good = up === (bom === "subir");
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium tabular-nums", good ? "text-income" : "text-expense")}>
      <Icon className="size-3.5" aria-hidden />
      {up ? "+" : "−"}
      {pct(Math.abs(value))}
    </span>
  );
}

/** Card com título, descrição opcional e conteúdo. */
export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-5">
      <div className="flex flex-col gap-1 px-(--card-spacing) sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="space-y-5 px-(--card-spacing)">{children}</div>
    </Card>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground">{children}</p>;
}

/** Tabela compacta com rolagem horizontal no celular. */
export function DataTable({ head, children }: { head: { label: string; right?: boolean }[]; children: React.ReactNode }) {
  return (
    <div className="-mx-(--card-spacing) overflow-x-auto px-(--card-spacing)">
      <table className="w-full min-w-[32rem] text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            {head.map((h) => (
              <th key={h.label} className={cn("py-2 pr-3 font-medium last:pr-0", h.right ? "text-right" : "text-left")}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, right, className }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={cn("py-2 pr-3 last:pr-0", right && "text-right tabular-nums", className)}>{children}</td>;
}
