import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Id do usuário logado; redireciona para /login se não houver sessão.
 * getClaims valida o JWT localmente (chave pública em cache), sem ida ao Supabase Auth.
 */
export const requireUserId = cache(async (): Promise<string> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect("/login");
  return userId;
});
