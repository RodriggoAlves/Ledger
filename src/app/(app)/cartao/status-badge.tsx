import type { InvoiceStatus } from "@/db/credit";

const STATUS: Record<InvoiceStatus, { label: string; className: string }> = {
  PAGA: { label: "Paga", className: "bg-[color-mix(in_srgb,var(--income)_16%,transparent)] text-income" },
  FECHADA: { label: "Fechada", className: "bg-muted text-foreground" },
  PROJETADA: { label: "Projetada", className: "border border-dashed text-muted-foreground" },
};

export function StatusBadge({ status, className = "" }: { status: InvoiceStatus; className?: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS[status].className} ${className}`}>
      {STATUS[status].label}
    </span>
  );
}
