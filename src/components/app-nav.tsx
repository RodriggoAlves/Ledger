"use client";

import { ArrowLeftRight, BarChart3, CreditCard, LayoutDashboard, PiggyBank } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const NAV = [
  { href: "/", label: "Visão geral", short: "Início", icon: LayoutDashboard },
  { href: "/transacoes", label: "Transações", short: "Transações", icon: ArrowLeftRight },
  { href: "/cartao", label: "Cartão", short: "Cartão", icon: CreditCard },
  { href: "/relatorios", label: "Relatórios", short: "Relatórios", icon: BarChart3 },
  { href: "/investimentos", label: "Investimentos", short: "Investir", icon: PiggyBank },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
}

/** Menu em pílula do cabeçalho, para telas médias e grandes. */
export function AppNav() {
  const isActive = useIsActive();

  return (
    <nav aria-label="Principal" className="glass hidden gap-1 rounded-full p-1 ring-1 ring-border md:flex">
      {NAV.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              active
                ? "bg-brand font-semibold text-white shadow-[0_6px_20px_-8px_var(--brand-from)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <item.icon className="size-4" strokeWidth={2.25} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Barra de abas fixa no rodapé, só no celular. */
export function BottomNav() {
  const isActive = useIsActive();

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  active ? "font-semibold text-primary" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-11 place-items-center rounded-full transition-colors",
                    active && "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)]",
                  )}
                >
                  <item.icon className="size-5" strokeWidth={active ? 2.5 : 2} aria-hidden />
                </span>
                {item.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
