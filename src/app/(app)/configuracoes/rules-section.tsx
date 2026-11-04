"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { categoriesForType } from "@/domain/category-options";
import type { TxType } from "@/domain/picpay-parser";
import { categoryTipo, TIPO_LABEL } from "@/domain/tx-type";
import { deleteRule, upsertRule } from "./actions";

type Rule = { id: string; padrao: string; categoryId: string; tipo: TxType };
type Draft = { id?: string; padrao: string; categoryId: string; tipo: TxType };
type Option = { id: string; nome: string; tipo: TxType };

const EMPTY: Draft = { padrao: "", categoryId: "", tipo: "GASTO" };
const tipoItems = Object.entries(TIPO_LABEL).map(([value, label]) => ({ value, label }));

function RuleForm({ initial, categories, onDone }: { initial: Draft; categories: Option[]; onDone?: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [pending, startTransition] = useTransition();
  const items = categoriesForType(categories, draft.tipo, draft.categoryId || null).map((c) => ({ value: c.id, label: c.nome }));

  /** Estorno usa categorias de gasto; trocar para um tipo que não combina limpa a categoria. */
  function onTipo(tipo: TxType) {
    const atual = categories.find((c) => c.id === draft.categoryId);
    setDraft({ ...draft, tipo, categoryId: atual && atual.tipo === categoryTipo(tipo) ? draft.categoryId : "" });
  }

  function save() {
    startTransition(async () => {
      const res = await upsertRule(draft);
      if (res.error) return void toast.error(res.error);
      toast.success("Regra salva");
      if (!draft.id) setDraft(EMPTY);
      onDone?.();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Descrição contém</span>
      <Input
        placeholder="ex.: UBER"
        value={draft.padrao}
        onChange={(e) => setDraft({ ...draft, padrao: e.target.value })}
        className="w-full flex-1 sm:w-48"
      />
      <span className="text-sm text-muted-foreground">→</span>
      <Select items={tipoItems} value={draft.tipo} onValueChange={(v) => v && onTipo(v as TxType)}>
        <SelectTrigger className="w-36" aria-label="Tipo">
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
      <Select
        items={items}
        value={draft.categoryId || null}
        onValueChange={(v) => setDraft({ ...draft, categoryId: v ?? "" })}
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Categoria" />
        </SelectTrigger>
        <SelectContent>
          {items.map((o) => (
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

export function RulesSection({ rules, categories }: { rules: Rule[]; categories: Option[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameOf = new Map(categories.map((c) => [c.id, c.nome]));

  function remove(id: string) {
    startTransition(async () => {
      await deleteRule(id);
      toast.success("Regra excluída");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regras de categorização</CardTitle>
        <p className="text-sm text-muted-foreground">
          Aplicadas nas próximas importações. Gasto vale para dinheiro que sai; Receita e Estorno, para
          dinheiro que entra; Movimentação, para os dois. Quando várias casam, vale a de texto mais longo.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <RuleForm initial={EMPTY} categories={categories} />
        <ul className="divide-y">
          {rules.map((r) =>
            editing === r.id ? (
              <li key={r.id} className="py-2">
                <RuleForm initial={r} categories={categories} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <span className="flex-1">
                  contém <strong>{r.padrao}</strong> → {TIPO_LABEL[r.tipo]} · {nameOf.get(r.categoryId)}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setEditing(r.id)}>
                  Editar
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(r.id)}>
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
