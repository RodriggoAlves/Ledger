import { getCategories, getRulesWithIds } from "@/db/queries";
import { requireUserId } from "@/lib/auth";
import { CategoriesSection } from "./categories-section";
import { RulesSection } from "./rules-section";

export default async function ConfiguracoesPage() {
  const userId = await requireUserId();
  const [categories, rules] = await Promise.all([getCategories(userId), getRulesWithIds(userId)]);
  const options = categories.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo }));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Configurações</h1>
      <CategoriesSection categories={categories} />
      <RulesSection rules={rules} categories={options} />
    </div>
  );
}
