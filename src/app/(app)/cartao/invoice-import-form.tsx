"use client";

import { FileText, LoaderCircle, UploadCloud } from "lucide-react";
import { useState, useTransition } from "react";
import { cn } from "cn";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { InvoicePreview } from "@/domain/invoice-preview";
import { formatBRL } from "@/domain/money";
import { formatMonth } from "@/domain/month";
import { confirmInvoiceAction, previewInvoiceAction } from "./actions";

const formOf = (file: File) => {
  const form = new FormData();
  form.set("file", file);
  return form;
};

export function InvoiceImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);

  function onFile(f: File | undefined) {
    setPreview(null);
    setError(null);
    if (!f) return;
    setFile(f);
    startTransition(async () => {
      const res = await previewInvoiceAction(formOf(f));
      if (res.error) setError(res.error);
      else setPreview(res.preview!);
    });
  }

  function onConfirm() {
    if (!file) return;
    startTransition(async () => {
      const res = await confirmInvoiceAction(formOf(file));
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Fatura de ${formatMonth(preview!.mes)} importada`);
      setPreview(null);
      setFile(null);
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
          accept="application/pdf,.pdf"
          className="sr-only"
          disabled={pending}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <span className="bg-brand grid size-14 place-items-center rounded-2xl text-white shadow-[0_10px_30px_-12px_var(--brand-from)]">
          {pending ? (
            <LoaderCircle className="size-6 animate-spin" aria-hidden />
          ) : file ? (
            <FileText className="size-6" aria-hidden />
          ) : (
            <UploadCloud className="size-6" aria-hidden />
          )}
        </span>
        {file ? (
          <span>
            <span className="block font-semibold">{file.name}</span>
            <span className="text-sm text-muted-foreground">
              {pending ? "Lendo a fatura..." : "Clique para escolher outro arquivo"}
            </span>
          </span>
        ) : (
          <span>
            <span className="block font-semibold">Arraste o PDF da fatura aqui ou clique para escolher</span>
            <span className="text-sm text-muted-foreground">Fatura do cartão PicPay, baixada no fechamento</span>
          </span>
        )}
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {preview && (
        <Card>
          <CardContent className="space-y-3 text-sm">
            <p className="text-base font-semibold capitalize">
              Fatura de {formatMonth(preview.mes)} · vence em {preview.vencimento}
            </p>
            <p>
              Total conferido: <strong>{formatBRL(preview.totalGeral)}</strong> · {preview.novas} compras novas ·{" "}
              {preview.confirmadas} parcelas confirmadas · {preview.semCategoria} sem categoria
              {preview.ignoradas > 0 && ` · ${preview.ignoradas} já importadas`}
            </p>
            {preview.pagaMes && (
              <p>
                Pagamento encontrado: a fatura de <span className="capitalize">{formatMonth(preview.pagaMes)}</span> será
                marcada como paga.
              </p>
            )}
            {preview.naoVieram.length > 0 && (
              <div className="rounded-md border border-destructive/40 p-3">
                <p className="mb-1 font-medium">Parcelas canceladas</p>
                {preview.naoVieram.map((t) => (
                  <p key={t} className="text-muted-foreground">
                    {t}
                  </p>
                ))}
              </div>
            )}
            <Button onClick={onConfirm} disabled={pending}>
              Importar fatura
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
