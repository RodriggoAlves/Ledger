"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NOME_EXTRATO_AJUDA } from "@/domain/titular";
import { saveNomeExtrato } from "./actions";

/** Campo do nome no extrato; usado em Configurações e no passo 2 do fechamento. */
export function NomeExtratoForm({ initial }: { initial: string | null }) {
  const [nome, setNome] = useState(initial ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await saveNomeExtrato(nome);
      if (res.error) return void toast.error(res.error);
      toast.success("Nome salvo");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="ex.: MARIA DA SILVA"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        className="w-full flex-1 sm:w-72"
        aria-label="Seu nome no extrato"
      />
      <Button onClick={save} disabled={pending}>
        Salvar
      </Button>
    </div>
  );
}

export function NomeExtratoSection({ nome }: { nome: string | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Seu nome no extrato</CardTitle>
        <p className="text-sm text-muted-foreground">{NOME_EXTRATO_AJUDA}</p>
      </CardHeader>
      <CardContent>
        <NomeExtratoForm initial={nome} />
      </CardContent>
    </Card>
  );
}
