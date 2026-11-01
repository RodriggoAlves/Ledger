"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__all__";

/** Select que grava a escolha em um parâmetro da URL (?name=valor). */
export function SearchParamSelect({
  name,
  value,
  options,
  allLabel,
}: {
  name: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function onChange(next: string | null) {
    const sp = new URLSearchParams(params);
    if (!next || next === ALL) sp.delete(name);
    else sp.set(name, next);
    router.push(`${pathname}?${sp}`);
  }

  const items = allLabel ? [{ value: ALL, label: allLabel }, ...options] : options;

  return (
    <Select items={items} value={value ?? ALL} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
