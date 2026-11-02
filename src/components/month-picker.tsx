"use client";

import { Popover } from "@base-ui/react/popover";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { cn } from "cn";
import { formatMonth, type MonthKey } from "@/domain/month";

const NOMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const yearOf = (m: MonthKey) => Number(m.slice(0, 4));

/**
 * Seletor de mês em grade (ano + 12 meses), gravado em ?mes=.
 * Sem ?mes= a página mostra o mês atual; meses com dados ganham um ponto.
 */
export function MonthPicker({ value, today, available }: { value: MonthKey; today: MonthKey; available: MonthKey[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(yearOf(value));
  const withData = new Set(available);

  function go(month: MonthKey) {
    const sp = new URLSearchParams(params);
    if (month === today) sp.delete("mes");
    else sp.set("mes", month);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    setOpen(false);
  }

  function onOpenChange(next: boolean) {
    if (next) setYear(yearOf(value));
    setOpen(next);
  }

  return (
    <div className="flex items-center gap-2">
      {value !== today && (
        <button
          type="button"
          onClick={() => go(today)}
          className="rounded-full px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Mês atual
        </button>
      )}
      <Popover.Root open={open} onOpenChange={onOpenChange}>
        <Popover.Trigger
          className="glass flex items-center gap-2 rounded-full py-2 pr-3 pl-3.5 text-sm font-semibold ring-1 ring-border transition-colors hover:ring-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[popup-open]:ring-primary"
          aria-label={`Mês exibido: ${formatMonth(value)}. Trocar mês`}
        >
          <CalendarDays className="size-4 text-primary" aria-hidden />
          <span className="capitalize">{formatMonth(value)}</span>
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner sideOffset={8} align="end" className="z-50">
            <Popover.Popup className="w-72 origin-(--transform-origin) rounded-2xl bg-popover p-3 text-popover-foreground shadow-[0_20px_50px_-20px_rgb(0_0_0/0.6)] ring-1 ring-border transition-[transform,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setYear((y) => y - 1)}
                  aria-label={`Ano ${year - 1}`}
                  className="grid size-8 place-items-center rounded-full hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="font-display font-semibold tabular-nums">{year}</span>
                <button
                  type="button"
                  onClick={() => setYear((y) => y + 1)}
                  aria-label={`Ano ${year + 1}`}
                  className="grid size-8 place-items-center rounded-full hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {NOMES.map((nome, i) => {
                  const month = `${year}-${String(i + 1).padStart(2, "0")}`;
                  const selected = month === value;
                  return (
                    <button
                      key={month}
                      type="button"
                      onClick={() => go(month)}
                      aria-pressed={selected}
                      aria-label={`${formatMonth(month)}${withData.has(month) ? ", com lançamentos" : ""}`}
                      className={cn(
                        "relative flex h-11 flex-col items-center justify-center rounded-xl text-sm capitalize transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        selected
                          ? "bg-primary font-semibold text-primary-foreground"
                          : month === today
                            ? "font-semibold text-primary ring-1 ring-primary/60 hover:bg-accent"
                            : "hover:bg-accent",
                      )}
                    >
                      {nome}
                      {withData.has(month) && (
                        <span
                          className={cn("absolute bottom-1.5 size-1 rounded-full", selected ? "bg-primary-foreground" : "bg-primary")}
                          aria-hidden
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
