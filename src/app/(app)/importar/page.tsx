import { getCategories } from "@/db/queries";
import { requireUserId } from "@/lib/auth";
import { ImportForm } from "./import-form";
import { ImportHistory } from "./import-history";

export default async function ImportarPage() {
  const userId = await requireUserId();
  const categories = await getCategories(userId);
  const names = Object.fromEntries(categories.map((c) => [c.id, c.nome]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Importar extrato</h1>
        <p className="text-sm text-muted-foreground">
          Envie o CSV exportado pelo PicPay. Transações já importadas são ignoradas.
        </p>
      </div>
      <ImportForm categoryNames={names} />
      <ImportHistory userId={userId} />
    </div>
  );
}
