import { Upload } from "lucide-react";
import Link from "next/link";

/** Atalho para importar o extrato, no topo das telas que dependem dele. */
export function ImportLink() {
  return (
    <Link
      href="/importar"
      className="glass flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold ring-1 ring-border transition-colors hover:ring-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Upload className="size-4 text-primary" aria-hidden />
      Importar extrato
    </Link>
  );
}
