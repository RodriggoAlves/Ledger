import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { userSettings } from "./schema";

/** Nome do usuário como aparece no extrato (Pix entre suas contas); null se não configurado. */
export async function getNomeExtrato(db: Db, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ nome: userSettings.nomeExtrato })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  return row?.nome ?? null;
}

export async function setNomeExtrato(db: Db, userId: string, nome: string | null): Promise<void> {
  await db
    .insert(userSettings)
    .values({ userId, nomeExtrato: nome })
    .onConflictDoUpdate({ target: userSettings.userId, set: { nomeExtrato: nome } });
}
