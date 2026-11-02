import { expect, test } from "vitest";
import { transactionsHref } from "@/domain/transactions-link";

test("month only", () => {
  expect(transactionsHref("2026-10")).toBe("/transacoes?mes=2026-10");
});

test("income", () => {
  expect(transactionsHref("2026-10", { tipo: "RECEITA" })).toBe("/transacoes?mes=2026-10&tipo=RECEITA");
});

test("category of expenses", () => {
  expect(transactionsHref("2026-10", { categoryId: "c1", tipo: "GASTO" })).toBe(
    "/transacoes?mes=2026-10&categoria=c1&tipo=GASTO",
  );
});

test("uncategorized", () => {
  expect(transactionsHref("2026-10", { categoryId: "none", tipo: "GASTO" })).toBe(
    "/transacoes?mes=2026-10&categoria=none&tipo=GASTO",
  );
});

test("card origin", () => {
  expect(transactionsHref("2026-10", { origem: "CARTAO" })).toBe("/transacoes?mes=2026-10&origem=CARTAO");
});

test("all filters keep the order mes, categoria, tipo, origem", () => {
  expect(transactionsHref("2026-10", { origem: "CONTA", tipo: "GASTO", categoryId: "c1" })).toBe(
    "/transacoes?mes=2026-10&categoria=c1&tipo=GASTO&origem=CONTA",
  );
});
