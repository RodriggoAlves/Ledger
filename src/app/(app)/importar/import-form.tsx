"use client";

import { FileSpreadsheet, LoaderCircle, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { cn } from "cn";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/domain/money";
import { confirmImport, previewImport, type ImportPreview } from "./actions";

export function ImportForm({ categoryNames }: { categoryNames: Record<string, string> }) {
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);

  async function onFile(f: File | undefined) {
    setPreview(null);
    setError(null);
    setDone(null);
    if (!f) return;
    const content = await f.text();
    setFile({ name: f.name, content });
    startTransition(async () => {
      const res = await previewImport(content);
      if (res.error) setError(res.error);
      else setPreview(res.preview!);
    });
  }

  function onConfirm() {
    if (!file) return;
    startTransition(async () => {
      const res = await confirmImport(file.name, file.content);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.inseridas} transações importadas`);
      setDone(res.inseridas!);
      setPreview(null);
    });
  }

  return (
    <div className="space-y-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!pending) onFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "glass flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors focus-within:ring-2 focus-within:ring-ring hover:border-primary/60 hover:bg-accent/40",
          dragging ? "border-primary bg-accent/50" : "border-border",
          pending && "pointer-events-none opacity-70",
        )}
      >
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          disabled={pending}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <span className="bg-brand grid size-14 place-items-center rounded-2xl text-white shadow-[0_10px_30px_-12px_var(--brand-from)]">
          {pending ? (
            <LoaderCircle className="size-6 animate-spin" aria-hidden />
          ) : file ? (
            <FileSpreadsheet className="size-6" aria-hidden />
          ) : (
            <UploadCloud className="size-6" aria-hidden />
          )}
        </span>
        {file ? (
          <span>
            <span className="block font-semibold">{file.name}</span>
            <span className="text-sm text-muted-foreground">
              {pending ? "Lendo o arquivo..." : "Clique para escolher outro arquivo"}
            </span>
          </span>
        ) : (
          <span>
            <span className="block font-semibold">Arraste o CSV aqui ou clique para escolher</span>
            <span className="text-sm text-muted-foreground">Arquivo .csv exportado do PicPay</span>
          </span>
        )}
        <span className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground">
          {file ? "Trocar arquivo" : "Escolher arquivo"}
        </span>
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {done !== null && (
        <p className="text-sm">
          Importação concluída: {done} novas transações.{" "}
          <Link href="/transacoes" className="underline">
            Ver transações
          </Link>
        </p>
      )}

      {preview && (
        <Card>
          <CardContent className="space-y-4">
            <p className="text-sm">
              {preview.total} linhas · <strong>{preview.novas.length} novas</strong> · {preview.duplicadas} já
              importadas · {preview.semCategoria} sem categoria · {preview.invalidas.length} não reconhecidas
            </p>

            {preview.invalidas.length > 0 && (
              <div className="rounded-md border border-destructive/40 p-3 text-sm">
                <p className="mb-1 font-medium">Linhas não reconhecidas (serão ignoradas)</p>
                {preview.invalidas.map((i) => (
                  <p key={i.line} className="text-muted-foreground">
                    Linha {i.line}: {i.reason} — <code className="break-all">{i.raw}</code>
                  </p>
                ))}
              </div>
            )}

            {preview.novas.length > 0 && (
              <div className="max-h-96 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.novas.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(r.dataHora).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                        </TableCell>
                        <TableCell>{r.descricao}</TableCell>
                        <TableCell>
                          {r.categoryId ? (
                            categoryNames[r.categoryId]
                          ) : (
                            <Badge variant="outline">Sem categoria</Badge>
                          )}
                        </TableCell>
                        <TableCell
                          className={`text-right whitespace-nowrap ${r.valor < 0 ? "text-red-600 dark:text-red-400" : ""}`}
                        >
                          {formatBRL(r.valor)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <Button onClick={onConfirm} disabled={pending || preview.novas.length === 0}>
              Confirmar importação
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
