import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";
import { createDb, type Db } from "@/db/client";
import { convertTransaction, CreditError, markInvoicePaid, saveCard } from "@/db/credit";
import { deleteImport, listImports } from "@/db/imports";
import { categories, categoryRules, creditCards, creditPurchases, imports, installments, invoices, transactions } from "@/db/schema";

config({ path: ".env.local" });
const url = process.env.TEST_DATABASE_URL;
// Uma conexão só para o arquivo: o pooler do Supabase limita clientes simultâneos.
const db = url ? createDb(url) : (null as unknown as Db);
afterAll(() => url && db.$client.end());

type SeedRow = { dataHora: Date; hash: string; origem?: "CSV" | "MANUAL" };

function txValues(userId: string, importId: string | null, r: SeedRow) {
  return {
    userId,
    importId,
    dataHora: r.dataHora,
    descricao: "TESTE",
    tipoOriginal: "Compra realizada",
    valor: -1000,
    tipo: "GASTO" as const,
    origem: r.origem ?? ("CSV" as const),
    hashUnico: r.hash,
  };
}

async function seedImport(db: Db, userId: string, nome: string, rows: SeedRow[], criadoEm?: Date) {
  const [imp] = await db
    .insert(imports)
    .values({ userId, nomeArquivo: nome, linhasTotal: rows.length, linhasNovas: rows.length, ...(criadoEm && { criadoEm }) })
    .returning({ id: imports.id });
  if (rows.length) await db.insert(transactions).values(rows.map((r) => txValues(userId, imp.id, r)));
  return imp.id;
}

async function cleanup(db: Db, userIds: string[]) {
  await db.delete(installments).where(inArray(installments.userId, userIds));
  await db.delete(creditPurchases).where(inArray(creditPurchases.userId, userIds));
  await db.delete(invoices).where(inArray(invoices.userId, userIds));
  await db.delete(creditCards).where(inArray(creditCards.userId, userIds));
  await db.delete(transactions).where(inArray(transactions.userId, userIds));
  await db.delete(imports).where(inArray(imports.userId, userIds));
  await db.delete(categories).where(inArray(categories.userId, userIds));
}

describe.skipIf(!url)("importações (integração)", { timeout: 30_000 }, () => {
  test("lists imports newest first with count and period", async () => {
    const userId = randomUUID();
    try {
      await seedImport(
        db,
        userId,
        "antigo.csv",
        [
          { dataHora: new Date("2026-09-20T08:00:00Z"), hash: "a2" },
          { dataHora: new Date("2026-09-03T10:00:00Z"), hash: "a1" },
        ],
        new Date("2026-10-01T12:00:00Z"),
      );
      await seedImport(db, userId, "novo.csv", [{ dataHora: new Date("2026-10-05T10:00:00Z"), hash: "b1" }], new Date("2026-11-01T12:00:00Z"));

      const list = await listImports(db, userId);
      expect(list.map((i) => i.nomeArquivo)).toEqual(["novo.csv", "antigo.csv"]);
      expect(list[1].transacoes).toBe(2);
      expect(list[1].inicio).toEqual(new Date("2026-09-03T10:00:00Z"));
      expect(list[1].fim).toEqual(new Date("2026-09-20T08:00:00Z"));
    } finally {
      await cleanup(db, [userId]);
    }
  });

  test("lists an import with no transactions", async () => {
    const userId = randomUUID();
    try {
      await seedImport(db, userId, "vazio.csv", []);
      const [imp] = await listImports(db, userId);
      expect(imp.transacoes).toBe(0);
      expect(imp.inicio).toBeNull();
      expect(imp.fim).toBeNull();
    } finally {
      await cleanup(db, [userId]);
    }
  });

  test("deletes only the import's transactions", async () => {
    const userId = randomUUID();
    try {
      const a = await seedImport(db, userId, "a.csv", [
        { dataHora: new Date("2026-09-01T10:00:00Z"), hash: "a1" },
        { dataHora: new Date("2026-09-02T10:00:00Z"), hash: "a2" },
      ]);
      const b = await seedImport(db, userId, "b.csv", [{ dataHora: new Date("2026-09-03T10:00:00Z"), hash: "b1" }]);
      await db.insert(transactions).values(txValues(userId, null, { dataHora: new Date("2026-09-04T10:00:00Z"), hash: "m1", origem: "MANUAL" }));

      expect(await deleteImport(db, userId, a)).toEqual({ apagadas: 2 });

      const left = await db.select({ hash: transactions.hashUnico }).from(transactions).where(eq(transactions.userId, userId));
      expect(left.map((t) => t.hash).sort()).toEqual(["b1", "m1"]);
      const imps = await db.select({ id: imports.id }).from(imports).where(eq(imports.userId, userId));
      expect(imps.map((i) => i.id)).toEqual([b]);
    } finally {
      await cleanup(db, [userId]);
    }
  });

  test("keeps category rules", async () => {
    const userId = randomUUID();
    try {
      const [cat] = await db.insert(categories).values({ userId, nome: "Teste", cor: "#000000", tipo: "GASTO" }).returning();
      await db.insert(categoryRules).values({ userId, padrao: "TESTE", categoryId: cat.id });
      const a = await seedImport(db, userId, "a.csv", [{ dataHora: new Date("2026-09-01T10:00:00Z"), hash: "a1" }]);

      await deleteImport(db, userId, a);

      const rules = await db.select().from(categoryRules).where(eq(categoryRules.userId, userId));
      expect(rules).toHaveLength(1);
    } finally {
      await cleanup(db, [userId]);
    }
  });

  test("does not delete another user's import", async () => {
    const owner = randomUUID();
    const other = randomUUID();
    try {
      const a = await seedImport(db, owner, "a.csv", [{ dataHora: new Date("2026-09-01T10:00:00Z"), hash: "a1" }]);
      expect(await deleteImport(db, other, a)).toBeNull();
      const left = await db.select().from(transactions).where(eq(transactions.userId, owner));
      expect(left).toHaveLength(1);
    } finally {
      await cleanup(db, [owner, other]);
    }
  });

  test("returns null when import does not exist", async () => {
    expect(await deleteImport(db, randomUUID(), randomUUID())).toBeNull();
  });

  test("reimport after delete inserts rows again", async () => {
    const userId = randomUUID();
    try {
      const a = await seedImport(db, userId, "a.csv", [{ dataHora: new Date("2026-09-01T10:00:00Z"), hash: "h1" }]);
      await deleteImport(db, userId, a);
      const rows = await db
        .insert(transactions)
        .values(txValues(userId, null, { dataHora: new Date("2026-09-01T10:00:00Z"), hash: "h1" }))
        .onConflictDoNothing({ target: [transactions.userId, transactions.hashUnico] })
        .returning({ id: transactions.id });
      expect(rows).toHaveLength(1);
    } finally {
      await cleanup(db, [userId]);
    }
  });
});

describe.skipIf(!url)("importações com crédito (integração)", { timeout: 30_000 }, () => {
  async function seedConverted(userId: string) {
    await saveCard(db, userId, { nome: "Cartão", diaFechamento: 10, diaVencimento: 17 });
    const importId = await seedImport(db, userId, "a.csv", [{ dataHora: new Date("2026-09-20T10:00:00Z"), hash: "c1" }]);
    const [tx] = await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.importId, importId));
    await convertTransaction(db, userId, tx.id, { parcelas: 2, jaPagas: 0 });
    return importId;
  }

  test("deletes conversions of the import's transactions", async () => {
    const userId = randomUUID();
    try {
      const importId = await seedConverted(userId);
      expect(await deleteImport(db, userId, importId)).toEqual({ apagadas: 1 });
      expect(await db.select().from(creditPurchases).where(eq(creditPurchases.userId, userId))).toHaveLength(0);
      expect(await db.select().from(installments).where(eq(installments.userId, userId))).toHaveLength(0);
    } finally {
      await cleanup(db, [userId]);
    }
  });

  test("blocks when an installment is in a paid invoice", async () => {
    const userId = randomUUID();
    try {
      const importId = await seedConverted(userId);
      const [inv] = await db.select().from(invoices).where(eq(invoices.userId, userId)).limit(1);
      await markInvoicePaid(db, userId, inv.id);

      const attempt = deleteImport(db, userId, importId);
      await expect(attempt).rejects.toBeInstanceOf(CreditError);
      await expect(deleteImport(db, userId, importId)).rejects.toThrow(
        "Esta importação tem compras em faturas pagas. Desfaça a conversão delas antes de excluir.",
      );
      expect(await db.select().from(transactions).where(eq(transactions.userId, userId))).toHaveLength(1);
      expect(await db.select().from(creditPurchases).where(eq(creditPurchases.userId, userId))).toHaveLength(1);
    } finally {
      await cleanup(db, [userId]);
    }
  });
});
