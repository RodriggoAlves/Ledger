"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addSnapshot, deleteSnapshot, setCdiOverride, setInvestmentPercent } from "./actions";

/** Roda a ação e mostra o erro ou a confirmação num toast. */
function useAction() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>, ok: string, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else {
        toast.success(ok);
        after?.();
      }
    });
  return { pending, run };
}

const toInput = (centesimos: number) => (centesimos / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function CdiForm({ taxaAnual, manual }: { taxaAnual: number; manual: boolean }) {
  const { pending, run } = useAction();
  const [valor, setValor] = useState(toInput(taxaAnual));
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setCdiOverride(valor), "CDI atualizado");
      }}
    >
      <label className="grid gap-1 text-xs text-muted-foreground">
        CDI anual (%)
        <Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className="w-28" aria-label="CDI anual em %" />
      </label>
      <Button type="submit" variant="outline" disabled={pending}>
        Usar esta taxa
      </Button>
      {manual && (
        <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => setCdiOverride(null), "Voltou para o CDI do Banco Central")}>
          Usar o do Banco Central
        </Button>
      )}
    </form>
  );
}

export function PercentForm({ id, percentual }: { id: string; percentual: number }) {
  const { pending, run } = useAction();
  const [valor, setValor] = useState(toInput(percentual));
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setInvestmentPercent(id, valor), "% do CDI atualizado");
      }}
    >
      <label className="grid gap-1 text-xs text-muted-foreground">
        % do CDI
        <Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className="w-24" />
      </label>
      <Button type="submit" variant="outline" disabled={pending}>
        Salvar
      </Button>
    </form>
  );
}

export function SnapshotForm({ investmentId, hoje }: { investmentId: string; hoje: string }) {
  const { pending, run } = useAction();
  const [saldo, setSaldo] = useState("");
  const [data, setData] = useState(hoje);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addSnapshot(investmentId, saldo, data), "Saldo real registrado", () => setSaldo(""));
      }}
    >
      <label className="grid gap-1 text-xs text-muted-foreground">
        Saldo no app do PicPay (R$)
        <Input value={saldo} onChange={(e) => setSaldo(e.target.value)} inputMode="decimal" placeholder="1.234,56" className="w-36" required />
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Em
        <Input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} className="w-40" required />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Informar saldo real"}
      </Button>
    </form>
  );
}

export function DeleteSnapshotButton({ id, label }: { id: string; label: string }) {
  const { pending, run } = useAction();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={`Excluir saldo de ${label}`}
      title="Excluir"
      onClick={() => run(() => deleteSnapshot(id), "Saldo excluído")}
    >
      <Trash2 aria-hidden />
    </Button>
  );
}
