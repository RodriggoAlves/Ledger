import { LogOut, Settings2, Wallet } from "lucide-react";
import Link from "next/link";
import { AppNav, BottomNav } from "@/components/app-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { requireUserId } from "@/lib/auth";
import { signOut } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUserId();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="bg-brand grid size-8 place-items-center rounded-xl text-white shadow-[0_6px_18px_-6px_var(--brand-from)]">
              <Wallet className="size-4" strokeWidth={2.25} aria-hidden />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">Ledger</span>
          </Link>
          <AppNav />
          <form action={signOut} className="ml-auto flex items-center gap-2">
            <Link
              href="/configuracoes"
              aria-label="Configurações"
              title="Configurações"
              className="glass grid size-9 place-items-center rounded-full text-muted-foreground ring-1 ring-border transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Settings2 className="size-4" aria-hidden />
            </Link>
            <ThemeToggle />
            <Button variant="ghost" size="sm" type="submit" className="text-muted-foreground">
              <LogOut aria-hidden />
              Sair
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-8 pb-28 md:pb-8">{children}</main>
      <BottomNav />
    </div>
  );
}
