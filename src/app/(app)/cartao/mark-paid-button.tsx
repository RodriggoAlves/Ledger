"use client";

import { Check } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markInvoicePaidAction } from "./actions";

export function MarkPaidButton({ invoiceId }: { invoiceId: string }) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const res = await markInvoicePaidAction(invoiceId);
      if (res.error) toast.error(res.error);
      else toast.success("Fatura marcada como paga");
    });
  }

  return (
    <Button onClick={onClick} disabled={pending}>
      <Check aria-hidden />
      {pending ? "Salvando..." : "Marcar como paga"}
    </Button>
  );
}
