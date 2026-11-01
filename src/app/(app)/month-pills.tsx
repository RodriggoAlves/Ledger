import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatMonth, type MonthKey } from "@/domain/month";

const shortMonth = (m: MonthKey) => formatMonth(m).split(" ")[0];

/** Navegação entre meses disponíveis: mais antigo à esquerda, mais recente à direita. */
export function MonthPills({ months, current }: { months: MonthKey[]; current: MonthKey }) {
  const i = months.indexOf(current);
  const older = i >= 0 ? months[i + 1] : undefined;
  const newer = i > 0 ? months[i - 1] : undefined;

  return (
    <div className="glass flex items-center gap-1 rounded-full p-1 ring-1 ring-border">
      <Arrow month={older} direction="prev" />
      {older && <span className="hidden px-2 text-sm text-muted-foreground capitalize sm:inline">{shortMonth(older)}</span>}
      <span className="px-3 font-display text-sm font-semibold capitalize">{formatMonth(current)}</span>
      {newer && <span className="hidden px-2 text-sm text-muted-foreground capitalize sm:inline">{shortMonth(newer)}</span>}
      <Arrow month={newer} direction="next" />
    </div>
  );
}

function Arrow({ month, direction }: { month?: MonthKey; direction: "prev" | "next" }) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  const base = "grid size-9 place-items-center rounded-full ring-1 ring-border transition-colors";

  if (!month) {
    return (
      <span className={`${base} opacity-30`} aria-hidden>
        <Icon className="size-4" />
      </span>
    );
  }
  return (
    <Link
      href={`/?mes=${month}`}
      className={`${base} hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
      aria-label={`Ver ${formatMonth(month)}`}
    >
      <Icon className="size-4" />
    </Link>
  );
}
