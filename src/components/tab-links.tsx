import Link from "next/link";
import { cn } from "cn";

/** Abas como links (?aba=), renderizadas no servidor; mantém os outros parâmetros da URL. */
export function TabLinks({
  tabs,
  active,
  basePath,
  params,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const href = (id: string) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (id !== tabs[0].id) sp.set("aba", id);
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <nav aria-label="Seções" className="-mx-4 overflow-x-auto px-4">
      <ul className="glass inline-flex gap-1 rounded-full p-1 ring-1 ring-border">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <li key={t.id}>
              <Link
                href={href(t.id)}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "block rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  on ? "bg-brand font-semibold text-white" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
