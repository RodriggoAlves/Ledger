import { FileSpreadsheet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { db } from "@/db/client";
import { listImports } from "@/db/imports";
import { formatPeriod } from "@/domain/period";
import { DeleteImportButton } from "./delete-import-button";

export async function ImportHistory({ userId }: { userId: string }) {
  const items = await listImports(db, userId);
  if (!items.length) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Importações anteriores</h2>
      <Card className="gap-0 py-1">
        <ul className="divide-y">
          {items.map((imp) => {
            const periodo = formatPeriod(imp.inicio, imp.fim);
            return (
              <li key={imp.id} className="flex items-center gap-3 px-(--card-spacing) py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-primary" aria-hidden>
                  <FileSpreadsheet className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{imp.nomeArquivo}</p>
                  <p className="text-xs text-muted-foreground">
                    {imp.transacoes} {imp.transacoes === 1 ? "transação" : "transações"}, {periodo}. Importado em{" "}
                    {imp.criadoEm.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </div>
                <DeleteImportButton id={imp.id} nomeArquivo={imp.nomeArquivo} transacoes={imp.transacoes} periodo={periodo} />
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
