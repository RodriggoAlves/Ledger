import { db } from "@/db/client";
import { getCategories, getRulesWithIds } from "@/db/queries";
import { getNomeExtrato } from "@/db/settings";
import { requireUserId } from "@/lib/auth";
import { CategoriesSection } from "./categories-section";
import { NomeExtratoSection } from "./nome-extrato-section";
import { RulesSection } from "./rules-section";

export default async function ConfiguracoesPage() {
  const userId = await requireUserId();
  const [categories, rules, nome] = await Promise.all([
    getCategories(userId),
    getRulesWithIds(userId),
    getNomeExtrato(db, userId),
  ]);
  const options = categories.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo }));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Configurações</h1>
      <NomeExtratoSection nome={nome} />
      <CategoriesSection categories={categories} />
      <RulesSection rules={rules} categories={options} />
    </div>
  );
}
