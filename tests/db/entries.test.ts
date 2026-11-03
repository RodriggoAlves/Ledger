import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { createDb } from "@/db/client";
import { getMonthEntries, getRangeEntries } from "@/db/entries";
import { transactions } from "@/db/schema";

config({ path: ".env.local" });
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("getRangeEntries (integração)", { timeout: 30_000 }, () => {
  test("agrupa o extrato por mês e bate com getMonthEntries", async () => {
    const db = createDb(url!);
    const userId = randomUUID();
    const tx = (data: string, valor: number) => ({
      userId,
      dataHora: new Date(`${data}T12:00:00Z`),
      descricao: `Teste ${data}`,
      tipoOriginal: "Pix enviado",
      valor,
      tipo: "GASTO" as const,
      origem: "CSV" as const,
      hashUnico: randomUUID(),
    });
    try {
      await db.insert(transactions).values([tx("2026-09-30", -1), tx("2026-10-01", -100), tx("2026-11-30", -200), tx("2026-12-01", -9)]);
      const range = await getRangeEntries(db, userId, "2026-10", "2026-11");
      expect([...range.keys()].sort()).toEqual(["2026-10", "2026-11"]);
      expect(range.get("2026-10")!.map((e) => e.valor)).toEqual([-100]);
      expect(await getMonthEntries(db, userId, "2026-11")).toEqual(range.get("2026-11"));
      expect(await getMonthEntries(db, userId, "2027-01")).toEqual([]);
    } finally {
      await db.delete(transactions).where(eq(transactions.userId, userId));
    }
  });
});
