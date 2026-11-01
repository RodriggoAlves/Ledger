import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db/client";
import { ensureUserDefaults } from "@/db/seed-user";
import { createClient } from "@/lib/supabase/server";

const seeded = new Set<string>();

/** Id do usuário logado; redireciona para /login se não houver sessão. */
export const requireUserId = cache(async (): Promise<string> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!seeded.has(user.id)) {
    await ensureUserDefaults(db, user.id);
    seeded.add(user.id);
  }
  return user.id;
});
