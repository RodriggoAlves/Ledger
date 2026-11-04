"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { MonthStatus } from "@/domain/closing";
import { closeMonthAction, reopenMonthAction } from "./actions";

export function CloseButtons({ mes, status, pendencias }: { mes: string; status: MonthStatus; pendencias: number }) {
  const [pending, startTransition] = useTransition();

  function run(action: (mes: string) => Promise<{ error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await action(mes);
      if (res.error) return void toast.error(res.error);
      toast.success(ok);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "ABERTO" && (
        <Button onClick={() => run(closeMonthAction, "Mês fechado")} disabled={pending}>
          {pendencias > 0 ? "Fechar mesmo assim" : "Fechar mês"}
        </Button>
      )}
      {status === "ALTERADO" && (
        <Button onClick={() => run(closeMonthAction, "Mês fechado de novo")} disabled={pending}>
          Refechar
        </Button>
      )}
      {status !== "ABERTO" && (
        <Button variant="ghost" onClick={() => run(reopenMonthAction, "Mês reaberto")} disabled={pending}>
          Reabrir
        </Button>
      )}
    </div>
  );
}
