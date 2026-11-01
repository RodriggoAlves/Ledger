"use server";

import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { ensureUserDefaults } from "@/db/seed-user";
import { createClient } from "@/lib/supabase/server";

export async function signIn(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return { error: "E-mail ou senha inválidos" };
  // Categorias padrão são criadas uma vez, no login, e não a cada página.
  await ensureUserDefaults(db, data.user.id);
  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
