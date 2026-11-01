import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(url: string) {
  return drizzle(postgres(url, { prepare: false }), { schema });
}

export type Db = ReturnType<typeof createDb>;

const globalForDb = globalThis as unknown as { db?: Db };

export const db: Db = globalForDb.db ?? createDb(process.env.DATABASE_URL!);
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
