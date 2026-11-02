import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";
import { createDb, type Db } from "@/db/client";
import {
  convertTransaction,
  createPurchase,
  CreditError,
  getInstallmentsForMonth,
  markInvoicePaid,
  saveCard,
  undoConversion,
} from "@/db/credit";
import { creditCards, creditPurchases, installments, invoices, transactions } from "@/db/schema";

config({ path: ".env.local" });
const url = process.env.TEST_DATABASE_URL;
// Uma conexão só para o arquivo: o pooler do Supabase limita clientes simultâneos.
const db = url ? createDb(url) : (null as unknown as Db);
afterAll(() => url && db.$client.end());

const CARD = { nome: "Nubank", diaFechamento: 10, diaVencimento: 17 };
const buy = { descricao: "TV", categoryId: null, dataCompra: new Date("2026-03-20T12:00:00Z"), parcelas: 3, jaPagas: 0 };

async function cleanup(db: Db, userIds: string[]) {
  await db.delete(installments).where(inArray(installments.userId, userIds));
  await db.delete(creditPurchases).where(inArray(creditPurchases.userId, userIds));
  await db.delete(invoices).where(inArray(invoices.userId, userIds));
  await db.delete(creditCards).where(inArray(creditCards.userId, userIds));
  await db.delete(transactions).where(inArray(transactions.userId, userIds));
}

async function insertTx(db: Db, userId: string, tipo: "GASTO" | "RECEITA" = "GASTO") {
  const [tx] = await db
    .insert(transactions)
    .values({
      userId,
      dataHora: new Date("2026-03-20T12:00:00Z"),
      descricao: "LOJA",
      tipoOriginal: "Compra realizada",
      valor: tipo === "GASTO" ? -30000 : 30000,
      tipo,
      origem: "CSV",
      hashUnico: randomUUID(),
    })
    .returning({ id: transactions.id });
  return tx.id;
}

const installmentsOf = (db: Db, userId: string) =>
  db.select().from(installments).where(eq(installments.userId, userId)).orderBy(asc(installments.numero));

describe.skipIf(!url)("crédito (integração)", { timeout: 30_000 }, () => {
  test("saveCard upserts a single card per user", async () => {
    const userId = randomUUID();
    try {
      await saveCard(db, userId, CARD);
      await saveCard(db, userId, { ...CARD, nome: "Inter" });
      const cards = await db.select().from(creditCards).where(eq(creditCards.userId, userId));
      expect(cards.map((c) => c.nome)).toEqual(["Inter"]);
    } finally {
      await cleanup(db, [userId]);
    }
  });

  test("createPurchase without a card is refused", async () => {
    await expect(createPurchase(db, randomUUID(), { ...buy, valorTotal: 10000 })).rejects.toThrow("Configure o cartão antes");
  });

  test("createPurchase splits 100,00 in 3 across invoices", async () => {
    const userId = randomUUID();
    try {
      await saveCard(db, userId, CARD);
      await createPurchase(db, userId, { ...buy, valorTotal: 10000, jaPagas: 1 });
      const inst = await installmentsOf(db, userId);
      expect(inst.map((i) => i.valor)).toEqual([3334, 3333, 3333]);
      expect(inst.map((i) => i.paga)).toEqual([true, false, false]);
      const invs = await db.select().from(invoices).where(eq(invoices.userId, userId)).orderBy(asc(invoices.mes));
      expect(invs.map((i) => i.mes)).toEqual(["2026-04", "2026-05", "2026-06"]);
    } finally {
      await cleanup(db, [userId]);
    }
  });

  test("createPurchase with valorParcela multiplies", async () => {
    const userId = randomUUID();
    try {
      await saveCard(db, userId, CARD);
      await createPurchase(db, userId, { ...buy, parcelas: 4, valorParcela: 2500 });
      const [p] = await db.select().from(creditPurchases).where(eq(creditPurchases.userId, userId));
      expect(p.valorTotal).toBe(10000);
    } finally {
      await cleanup(db, [userId]);
    }
  });

  test("two purchases share the same invoice", async () => {
    const userId = randomUUID();
    try {
      await saveCard(db, userId, CARD);
      await createPurchase(db, userId, { ...buy, parcelas: 1, valorTotal: 1000 });
      await createPurchase(db, userId, { ...buy, parcelas: 1, valorTotal: 2000 });
      const invs = await db.select().from(invoices).where(eq(invoices.userId, userId));
      expect(invs).toHaveLength(1);
    } finally {
      await cleanup(db, [userId]);
    }
  });

  test("rejects jaPagas greater than parcelas", async () => {
    const userId = randomUUID();
    try {
      await saveCard(db, userId, CARD);
      await expect(createPurchase(db, userId, { ...buy, valorTotal: 10000, jaPagas: 4 })).rejects.toBeInstanceOf(CreditError);
      expect(await db.select().from(creditPurchases).where(eq(creditPurchases.userId, userId))).toHaveLength(0);
    } finally {
      await cleanup(db, [userId]);
    }
  });

  test("rejects invalid number of installments", async () => {
    const userId = randomUUID();
    try {
      await saveCard(db, userId, CARD);
      await expect(createPurchase(db, userId, { ...buy, valorTotal: 10000, parcelas: 0 })).rejects.toThrow(
        "Número de parcelas inválido",
      );
    } finally {
      await cleanup(db, [userId]);
    }
  });

  test("convertTransaction marks transaction and creates purchase", async () => {
    const userId = randomUUID();
    try {
      await saveCard(db, userId, CARD);
      const txId = await insertTx(db, userId);
      await convertTransaction(db, userId, txId, { parcelas: 3, jaPagas: 0 });

      const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId));
      expect(tx.convertidaCredito).toBe(true);
      const [p] = await db.select().from(creditPurchases).where(eq(creditPurchases.userId, userId));
      expect(p).toMatchObject({ transactionId: txId, valorTotal: 30000, descricao: "LOJA", parcelas: 3 });

      await expect(convertTransaction(db, userId, txId, { parcelas: 3, jaPagas: 0 })).rejects.toThrow("Transação já convertida");
    } finally {
      await cleanup(db, [userId]);
    }
  });

  test("convertTransaction refuses income", async () => {
    const userId = randomUUID();
    try {
      await saveCard(db, userId, CARD);
      const txId = await insertTx(db, userId, "RECEITA");
      await expect(convertTransaction(db, userId, txId, { parcelas: 1, jaPagas: 0 })).rejects.toThrow(
        "Só gastos podem ir para o crédito",
      );
    } finally {
      await cleanup(db, [userId]);
    }
  });

  test("undoConversion removes purchase and installments and clears flag", async () => {
    const userId = randomUUID();
    try {
      await saveCard(db, userId, CARD);
      const txId = await insertTx(db, userId);
      await convertTransaction(db, userId, txId, { parcelas: 3, jaPagas: 0 });
      await undoConversion(db, userId, txId);

      const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId));
      expect(tx.convertidaCredito).toBe(false);
      expect(await db.select().from(creditPurchases).where(eq(creditPurchases.userId, userId))).toHaveLength(0);
      expect(await installmentsOf(db, userId)).toHaveLength(0);
    } finally {
      await cleanup(db, [userId]);
    }
  });

  test("markInvoicePaid marks invoice and its installments", async () => {
    const userId = randomUUID();
    try {
      await saveCard(db, userId, CARD);
      await createPurchase(db, userId, { ...buy, parcelas: 1, valorTotal: 1000 });
      const [inv] = await db.select().from(invoices).where(eq(invoices.userId, userId));

      expect(await markInvoicePaid(db, randomUUID(), inv.id)).toBe(false);
      expect(await markInvoicePaid(db, userId, inv.id)).toBe(true);

      const [after] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
      expect(after.paga).toBe(true);
      expect((await installmentsOf(db, userId)).every((i) => i.paga)).toBe(true);
    } finally {
      await cleanup(db, [userId]);
    }
  });

  test("getInstallmentsForMonth returns only that closing month", async () => {
    const userId = randomUUID();
    try {
      await saveCard(db, userId, CARD);
      await createPurchase(db, userId, { ...buy, valorTotal: 9000 });
      expect(await getInstallmentsForMonth(db, userId, "2026-05")).toEqual([{ valor: 3000, categoryId: null }]);
      expect(await getInstallmentsForMonth(db, userId, "2026-03")).toEqual([]);
    } finally {
      await cleanup(db, [userId]);
    }
  });
});
