"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TxType } from "@/domain/picpay-parser";
import { TIPO_LABEL } from "../transacoes/transaction-row";
import { deleteCategory, upsertCategory } from "./actions";

type Category = { id: string; nome: string; cor: string; tipo: TxType };
type Draft = Omit<Category, "id"> & { id?: string };

const EMPTY: Draft = { nome: "", cor: "#2a78d6", tipo: "GASTO" };
const tipoItems = Object.entries(TIPO_LABEL).map(([value, label]) => ({ value, label }));

function CategoryForm({ initial, onDone }: { initial: Draft; onDone?: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await upsertCategory(draft);
      if (res.error) return void toast.error(res.error);
      toast.success("Categoria salva");
      if (!draft.id) setDraft(EMPTY);
      onDone?.();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="color"
        aria-label="Cor"
        value={draft.cor}
        onChange={(e) => setDraft({ ...draft, cor: e.target.value })}
        className="h-9 w-10 cursor-pointer rounded border bg-transparent"
      />
      <Input
        placeholder="Nome"
        value={draft.nome}
        onChange={(e) => setDraft({ ...draft, nome: e.target.value })}
        className="w-full flex-1 sm:w-48"
      />
      <Select items={tipoItems} value={draft.tipo} onValueChange={(v) => v && setDraft({ ...draft, tipo: v as TxType })}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {tipoItems.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={save} disabled={pending}>
        {draft.id ? "Salvar" : "Adicionar"}
      </Button>
      {onDone && (
        <Button variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      )}
    </div>
  );
}

export function CategoriesSection({ categories }: { categories: Category[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove(c: Category) {
    if (!confirm(`Excluir "${c.nome}"? As transações dela ficarão sem categoria.`)) return;
    startTransition(async () => {
      await deleteCategory(c.id);
      toast.success("Categoria excluída");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categorias</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <CategoryForm initial={EMPTY} />
        <ul className="divide-y">
          {categories.map((c) =>
            editing === c.id ? (
              <li key={c.id} className="py-2">
                <CategoryForm initial={c} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <span className="size-3 shrink-0 rounded-full" style={{ background: c.cor }} aria-hidden />
                <span className="flex-1">{c.nome}</span>
                <span className="text-sm text-muted-foreground">{TIPO_LABEL[c.tipo]}</span>
                <Button size="sm" variant="ghost" onClick={() => setEditing(c.id)}>
                  Editar
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(c)}>
                  Excluir
                </Button>
              </li>
            ),
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
