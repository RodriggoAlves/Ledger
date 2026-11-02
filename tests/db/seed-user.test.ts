import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { createDb } from "@/db/client";
import { categories, categoryRules } from "@/db/schema";
import { ensureUserDefaults } from "@/db/seed-user";

config({ path: ".env.local" });
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("ensureUserDefaults (integração)", { timeout: 30_000 }, () => {
  test("is idempotent", async () => {
    const db = createDb(url!);
    const userId = randomUUID();
    try {
      await ensureUserDefaults(db, userId);
      await ensureUserDefaults(db, userId);
      const cats = await db.select().from(categories).where(eq(categories.userId, userId));
      const rules = await db.select().from(categoryRules).where(eq(categoryRules.userId, userId));
      expect(cats).toHaveLength(15);
      expect(rules).toHaveLength(10);
    } finally {
      await db.delete(categories).where(eq(categories.userId, userId));
    }
  });
});

describe.skipIf(!url)("ensureUserDefaults após exclusão (integração)", { timeout: 30_000 }, () => {
  test("does not recreate a deleted default category", async () => {
    const db = createDb(url!);
    const userId = randomUUID();
    try {
      await ensureUserDefaults(db, userId);
      await db
        .delete(categories)
        .where(and(eq(categories.userId, userId), eq(categories.nome, "Transporte")));
      await ensureUserDefaults(db, userId);
      const cats = await db.select().from(categories).where(eq(categories.userId, userId));
      expect(cats.map((c) => c.nome)).not.toContain("Transporte");
    } finally {
      await db.delete(categories).where(eq(categories.userId, userId));
    }
  });
});
