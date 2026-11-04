"use client";

import { Tabs } from "@base-ui/react/tabs";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TxType } from "@/domain/picpay-parser";
import { CATEGORY_TIPOS, TIPO_LABEL } from "@/domain/tx-type";
import { deleteCategory, upsertCategory } from "./actions";

type Category = { id: string; nome: string; cor: string; tipo: TxType };
type Draft = Omit<Category, "id"> & { id?: string };

const TABS: { tipo: TxType; label: string; vazio: string }[] = [
  { tipo: "GASTO", label: "Gastos", vazio: "Nenhuma categoria de gasto." },
  { tipo: "RECEITA", label: "Receitas", vazio: "Nenhuma categoria de receita." },
  { tipo: "MOVIMENTACAO", label: "Movimentação", vazio: "Nenhuma categoria de movimentação." },
];
const newDraft = (tipo: TxType): Draft => ({ nome: "", cor: "#2a78d6", tipo });
// Estorno não tem categorias próprias: usa as de gasto.
const tipoItems = CATEGORY_TIPOS.map((value) => ({ value, label: TIPO_LABEL[value] }));

/** Nova categoria usa o tipo da aba; o seletor de tipo só aparece ao editar (para mover de aba). */
function CategoryForm({ initial, onDone }: { initial: Draft; onDone?: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await upsertCategory(draft);
      if (res.error) return void toast.error(res.error);
      toast.success("Categoria salva");
      if (!draft.id) setDraft(initial);
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
      {draft.id && (
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
      )}
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
  const [tab, setTab] = useState<TxType>("GASTO");
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
      <CardContent>
        <Tabs.Root value={tab} onValueChange={(v) => setTab(v as TxType)} className="space-y-4">
          <Tabs.List className="glass inline-flex gap-1 rounded-full p-1 ring-1 ring-border">
            {TABS.map((t) => (
              <Tabs.Tab
                key={t.tipo}
                value={t.tipo}
                className="rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[active]:bg-brand data-[active]:font-semibold data-[active]:text-white"
              >
                {t.label}
                <span className="ml-1.5 tabular-nums opacity-70">{categories.filter((c) => c.tipo === t.tipo).length}</span>
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {TABS.map((t) => {
            const lista = categories.filter((c) => c.tipo === t.tipo);
            return (
              <Tabs.Panel key={t.tipo} value={t.tipo} className="space-y-4">
                <CategoryForm initial={newDraft(t.tipo)} />
                {lista.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.vazio}</p>
                ) : (
                  <ul className="divide-y">
                    {lista.map((c) =>
                      editing === c.id ? (
                        <li key={c.id} className="py-2">
                          <CategoryForm initial={c} onDone={() => setEditing(null)} />
                        </li>
                      ) : (
                        <li key={c.id} className="flex items-center gap-3 py-2">
                          <span className="size-3 shrink-0 rounded-full" style={{ background: c.cor }} aria-hidden />
                          <span className="flex-1">{c.nome}</span>
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
                )}
              </Tabs.Panel>
            );
          })}
        </Tabs.Root>
      </CardContent>
    </Card>
  );
}
