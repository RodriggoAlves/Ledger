import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireUserId } from "@/lib/auth";
import { signOut } from "../login/actions";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/transacoes", label: "Transações" },
  { href: "/importar", label: "Importar" },
  { href: "/configuracoes", label: "Configurações" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUserId();

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <span className="font-semibold">Finanças</span>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm text-muted-foreground hover:text-foreground">
              {item.label}
            </Link>
          ))}
          <form action={signOut} className="ml-auto">
            <Button variant="ghost" size="sm" type="submit">
              Sair
            </Button>
          </form>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
