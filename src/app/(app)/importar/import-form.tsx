"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/domain/money";
import { confirmImport, previewImport, type ImportPreview } from "./actions";

export function ImportForm({ categoryNames }: { categoryNames: Record<string, string> }) {
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

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
      <Input type="file" accept=".csv,text/csv" disabled={pending} onChange={(e) => onFile(e.target.files?.[0])} />
      {pending && <p className="text-sm text-muted-foreground">Processando...</p>}
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
                          {new Date(r.dataHora).toLocaleDateString("pt-BR")}
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
