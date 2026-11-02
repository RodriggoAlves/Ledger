import { expect, test } from "vitest";
import { invoiceCard } from "@/domain/invoice-card";
import { formatBRL } from "@/domain/money";

test("closed invoice", () => {
  expect(invoiceCard({ status: "FECHADA", vencimento: new Date(Date.UTC(2026, 10, 5)) }, 587910, "2026-10")).toEqual({
    value: formatBRL(587910),
    hint: "Fechada · vence 05/11/2026",
    href: "/transacoes?mes=2026-10&origem=CARTAO",
  });
});

test("paid invoice", () => {
  expect(invoiceCard({ status: "PAGA", vencimento: new Date(Date.UTC(2026, 9, 5)) }, 725, "2026-09")).toEqual({
    value: formatBRL(725),
    hint: "Paga · vence 05/10/2026",
    href: "/transacoes?mes=2026-09&origem=CARTAO",
  });
});

test("projected invoice", () => {
  expect(invoiceCard({ status: "PROJETADA", vencimento: new Date(Date.UTC(2026, 11, 5)) }, 75761, "2026-11")).toEqual({
    value: formatBRL(75761),
    hint: "Projetada · a fatura ainda não fechou",
    href: "/transacoes?mes=2026-11&origem=CARTAO",
  });
});

test("no invoice", () => {
  expect(invoiceCard(null, 0, "2026-12")).toEqual({ value: "—", hint: "Nenhuma fatura neste mês", href: null });
});

test("a zero total never shows a minus sign", () => {
  // Fatura com todas as parcelas canceladas: o Dashboard passa -(soma) = -0.
  expect(invoiceCard({ status: "FECHADA", vencimento: new Date(Date.UTC(2026, 10, 5)) }, -0, "2026-10").value).toBe(
    formatBRL(0),
  );
});
