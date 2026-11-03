import Link from "next/link";
import { Card } from "@/components/ui/card";

const TONES = {
  income: "bg-[color-mix(in_srgb,var(--income)_16%,transparent)] text-income",
  expense: "bg-[color-mix(in_srgb,var(--expense)_16%,transparent)] text-expense",
  brand: "bg-brand text-white",
};

export function Stat({
  icon,
  tone,
  label,
  value,
  hint,
  href,
}: {
  icon: React.ReactNode;
  tone: keyof typeof TONES;
  label: string;
  value: string;
  hint: string;
  /** Com link, o card inteiro é clicável. */
  href?: string | null;
}) {
  const card = (
    <Card size="sm" className="h-full gap-3 px-(--card-spacing)">
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
  return href ? (
    <Link
      href={href}
      className="block rounded-2xl transition-shadow hover:ring-1 hover:ring-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {card}
    </Link>
  ) : (
    card
  );
}
