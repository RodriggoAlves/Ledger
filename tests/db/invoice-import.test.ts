import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { and, eq, inArray, isNotNull, like } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";
import { createDb, type Db } from "@/db/client";
import { CreditError, getInstallmentsForMonth, listInvoices, setPurchaseCategory } from "@/db/credit";
import { applyInvoiceImport, deleteInvoiceImport, listInvoiceImports, loadCardState } from "@/db/invoice-import";
import { categories, creditCards, creditPurchases, installments, invoiceImports, invoices } from "@/db/schema";
import { buildInvoiceImportPlan } from "@/domain/invoice-import-plan";
import { resolveLines } from "@/domain/invoice-lines";
import { parsePicPayInvoice } from "@/domain/picpay-invoice-parser";

config({ path: ".env.local" });
const url = process.env.TEST_DATABASE_URL;
const db = url ? createDb(url) : (null as unknown as Db);
afterAll(() => url && db.$client.end());

const SEPTEMBER = readFileSync("tests/fixtures/picpay-fatura-092026.txt", "utf8").split(/\r?\n/);
const OCTOBER = [
  "Vencimento: 05/11/2026 | Fechamento: 29/10/2026",
  "Picpay Card",
  "Transações Nacionais",
  "05/10 PAGAMENTO DE FATURA -7,25",
  "21/02 AMAZON BR PARC09/10 230,88",
  "16/09 MERCADOLIVRE*MPARC02/10 146,47",
  "Total geral dos lançamentos 377,35",
];

async function importText(userId: string, lines: string[], name: string) {
  const parsed = parsePicPayInvoice(lines);
  const plan = buildInvoiceImportPlan(parsed, resolveLines(parsed), await loadCardState(db, userId), []);
  return applyInvoiceImport(db, userId, name, plan);
}

async function cleanup(userIds: string[]) {
  await db.delete(creditCards).where(inArray(creditCards.userId, userIds));
  await db.delete(categories).where(inArray(categories.userId, userIds));
}

const statusOf = async (userId: string, mes: string) => (await listInvoices(db, userId)).find((i) => i.mes === mes);

describe.skipIf(!url)("importação de fatura (integração)", { timeout: 60_000 }, () => {
  test("imports september", async () => {
    const userId = randomUUID();
    try {
      await importText(userId, SEPTEMBER, "set.pdf");
      const [card] = await db.select().from(creditCards).where(eq(creditCards.userId, userId));
      expect(card).toMatchObject({ banco: "PICPAY", diaFechamento: 29, diaVencimento: 5 });
      expect(await statusOf(userId, "2026-09")).toMatchObject({ status: "FECHADA", total: 725 });
      expect((await statusOf(userId, "2026-10"))?.status).toBe("PROJETADA");
    } finally {
      await cleanup([userId]);
    }
  });

  test("importing october confirms and pays september", async () => {
    const userId = randomUUID();
    try {
      await importText(userId, SEPTEMBER, "set.pdf");
      await importText(userId, OCTOBER, "out.pdf");
      const amazon = await db
        .select()
        .from(creditPurchases)
        .where(and(eq(creditPurchases.userId, userId), like(creditPurchases.chave, "AMAZON BR|%")));
      expect(amazon).toHaveLength(1);
      const [nine] = await db
        .select()
        .from(installments)
        .where(and(eq(installments.purchaseId, amazon[0].id), eq(installments.numero, 9)));
      expect(nine.confirmadaPorImportId).not.toBeNull();
      expect((await statusOf(userId, "2026-09"))?.status).toBe("PAGA");
      const [gol] = await db
        .select({ cancelada: installments.canceladaPorImportId })
        .from(installments)
        .innerJoin(creditPurchases, eq(creditPurchases.id, installments.purchaseId))
        .where(and(eq(installments.userId, userId), like(creditPurchases.chave, "GOL LINHAS A*H|%"), eq(installments.numero, 4)));
      expect(gol.cancelada).not.toBeNull();
    } finally {
      await cleanup([userId]);
    }
  });

  test("dashboard ignores cancelled installments", async () => {
    const userId = randomUUID();
    try {
      await importText(userId, SEPTEMBER, "set.pdf");
      await importText(userId, OCTOBER, "out.pdf");
      const october = await getInstallmentsForMonth(db, userId, "2026-10");
      expect(october.map((i) => i.valor).sort((a, b) => a - b)).toEqual([14647, 23088]);
    } finally {
      await cleanup([userId]);
    }
  });

  test("refuses deleting an older import", async () => {
    const userId = randomUUID();
    try {
      const set = await importText(userId, SEPTEMBER, "set.pdf");
      await importText(userId, OCTOBER, "out.pdf");
      await expect(deleteInvoiceImport(db, userId, set)).rejects.toBeInstanceOf(CreditError);
      await expect(deleteInvoiceImport(db, userId, set)).rejects.toThrow("Exclua primeiro a fatura de novembro de 2026");
    } finally {
      await cleanup([userId]);
    }
  });

  test("deleting the latest import restores previous state", async () => {
    const userId = randomUUID();
    try {
      await importText(userId, SEPTEMBER, "set.pdf");
      const out = await importText(userId, OCTOBER, "out.pdf");
      expect(await deleteInvoiceImport(db, userId, out)).toEqual({ ok: true });
      expect((await statusOf(userId, "2026-09"))?.status).toBe("FECHADA");
      expect((await statusOf(userId, "2026-10"))?.status).toBe("PROJETADA");
      const touched = await db
        .select({ id: installments.id })
        .from(installments)
        .where(and(eq(installments.userId, userId), isNotNull(installments.canceladaPorImportId)));
      expect(touched).toHaveLength(0);
      expect((await listInvoiceImports(db, userId)).map((i) => i.mes)).toEqual(["2026-10"]);
    } finally {
      await cleanup([userId]);
    }
  });

  test("another user's import is not found", async () => {
    const userId = randomUUID();
    const other = randomUUID();
    try {
      const set = await importText(userId, SEPTEMBER, "set.pdf");
      expect(await deleteInvoiceImport(db, other, set)).toBeNull();
      expect(await db.select().from(invoiceImports).where(eq(invoiceImports.userId, userId))).toHaveLength(1);
    } finally {
      await cleanup([userId, other]);
    }
  });

  test("setPurchaseCategory only touches own purchases", async () => {
    const userId = randomUUID();
    const other = randomUUID();
    try {
      await importText(userId, SEPTEMBER, "set.pdf");
      const [cat] = await db.insert(categories).values({ userId, nome: "Teste", cor: "#000", tipo: "GASTO" }).returning();
      const [p] = await db.select().from(creditPurchases).where(eq(creditPurchases.userId, userId)).limit(1);
      expect(await setPurchaseCategory(db, other, p.id, cat.id)).toBe(false);
      expect(await setPurchaseCategory(db, userId, p.id, cat.id)).toBe(true);
      const [after] = await db.select().from(creditPurchases).where(eq(creditPurchases.id, p.id));
      expect(after.categoryId).toBe(cat.id);
      expect(await db.select().from(invoices).where(eq(invoices.userId, other))).toHaveLength(0);
    } finally {
      await cleanup([userId, other]);
    }
  });
});
