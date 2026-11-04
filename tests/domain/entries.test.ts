import { describe, expect, test } from "vitest";
import { summarizeSpending } from "@/domain/summary";
import {
  buildMonthEntries,
  entriesTotal,
  entryLabels,
  filterEntries,
  parseOrigin,
  type AccountRow,
  type CardRow,
  type EntryFilters,
} from "@/domain/entries";

const d = (iso: string) => new Date(iso);
const conta = (over: Partial<AccountRow> = {}): AccountRow => ({
  id: "t1",
  dataHora: d("2026-10-14T10:08:00Z"),
  descricao: "GOOGLE",
  valor: -3599,
  tipo: "GASTO",
  categoryId: "assin",
  formaPagamento: "Com cartão",
  ...over,
});
const cartao = (over: Partial<CardRow> = {}): CardRow => ({
  installmentId: "i1",
  purchaseId: "p1",
  dataCompra: d("2026-02-21T00:00:00Z"),
  descricao: "AMAZON BR",
  valor: 23088,
  numero: 9,
  parcelas: 10,
  categoryId: "setup",
  tipo: "COMPRA",
  cancelada: false,
  ...over,
});

describe("buildMonthEntries", () => {
  test("card installment becomes a negative expense with its purchase data", () => {
    expect(buildMonthEntries([], [cartao()])).toEqual([
      {
        origem: "CARTAO",
        id: "i1",
        purchaseId: "p1",
        data: d("2026-02-21T00:00:00Z"),
        descricao: "AMAZON BR",
        valor: -23088,
        tipo: "GASTO",
        categoryId: "setup",
        parcela: { numero: 9, total: 10 },
        estorno: false,
      },
    ]);
  });

  test("account transaction keeps its sign, type and payment form", () => {
    expect(buildMonthEntries([conta()], [])).toEqual([
      {
        origem: "CONTA",
        id: "t1",
        data: d("2026-10-14T10:08:00Z"),
        descricao: "GOOGLE",
        valor: -3599,
        tipo: "GASTO",
        categoryId: "assin",
        formaPagamento: "Com cartão",
      },
    ]);
  });

  test("refund from the invoice is positive and one-off purchases have no installment", () => {
    const [e] = buildMonthEntries(
      [],
      [cartao({ descricao: "CREDITO PULA COMPRA", valor: -319900, numero: 1, parcelas: 1, tipo: "ESTORNO", categoryId: null })],
    );
    expect(e).toMatchObject({ valor: 319900, parcela: null, estorno: true, tipo: "ESTORNO" });
  });

  test("cancelled installments are left out", () => {
    expect(buildMonthEntries([], [cartao({ cancelada: true })])).toEqual([]);
  });

  test("sorted by date, newest first, then description", () => {
    const entries = buildMonthEntries(
      [conta({ id: "t1" }), conta({ id: "t2", descricao: "UBER", dataHora: d("2026-10-26T21:24:00Z") })],
      [cartao({ installmentId: "i1" }), cartao({ installmentId: "i2", descricao: "AIRBNB" })],
    );
    expect(entries.map((e) => e.id)).toEqual(["t2", "t1", "i2", "i1"]);
  });
});

describe("filterEntries", () => {
  const entries = buildMonthEntries(
    [
      conta({ id: "t1", categoryId: "setup" }),
      conta({ id: "t2", tipo: "RECEITA", valor: 500000, categoryId: null, formaPagamento: null }),
    ],
    [cartao({ installmentId: "i1", categoryId: "setup" }), cartao({ installmentId: "i2", categoryId: null })],
  );
  const ids = (f: EntryFilters) =>
    filterEntries(entries, f)
      .map((e) => e.id)
      .sort();

  test("by category includes both origins", () => {
    expect(ids({ categoryId: "setup" })).toEqual(["i1", "t1"]);
  });

  test("'none' matches entries without category from both origins", () => {
    expect(ids({ categoryId: "none" })).toEqual(["i2", "t2"]);
  });

  test("card entries are expenses", () => {
    expect(ids({ tipo: "RECEITA" })).toEqual(["t2"]);
  });

  test("by origin", () => {
    expect(ids({ origem: "CARTAO" })).toEqual(["i1", "i2"]);
    expect(ids({ origem: "CONTA" })).toEqual(["t1", "t2"]);
  });

  test("combined filters", () => {
    expect(ids({ tipo: "GASTO", categoryId: "setup", origem: "CARTAO" })).toEqual(["i1"]);
  });

  test("no filter keeps everything", () => {
    expect(ids({})).toEqual(["i1", "i2", "t1", "t2"]);
  });
});

test("entriesTotal is the signed sum", () => {
  const entries = buildMonthEntries(
    [conta(), conta({ id: "t2", tipo: "RECEITA", valor: 10000 })],
    [cartao(), cartao({ installmentId: "i2", valor: -1000, numero: 1, parcelas: 1, tipo: "ESTORNO" })],
  );
  expect(entriesTotal(entries)).toBe(-3599 + 10000 - 23088 + 1000);
  expect(entriesTotal([])).toBe(0);
});

test("labels", () => {
  const one = (a: AccountRow[], c: CardRow[]) => entryLabels(buildMonthEntries(a, c)[0]);
  expect(one([], [cartao()])).toEqual(["Compra no crédito", "9/10"]);
  expect(one([], [cartao({ numero: 1, parcelas: 1 })])).toEqual(["Compra no crédito"]);
  expect(
    one(
      [],
      [
        cartao({
          valor: -1098,
          numero: 1,
          parcelas: 1,
          tipo: "ESTORNO",
          descricao: "CRÉDITOS E ESTORNOS NÃO IDENTIFICADOS",
          categoryId: null,
        }),
      ],
    ),
  ).toEqual(["Estorno no crédito"]);
  expect(one([conta()], [])).toEqual(["Débito"]);
  expect(one([conta({ formaPagamento: "Com saldo" })], [])).toEqual([]);
});

test("parseOrigin accepts only CONTA and CARTAO", () => {
  expect(parseOrigin("CONTA")).toBe("CONTA");
  expect(parseOrigin("CARTAO")).toBe("CARTAO");
  expect(parseOrigin("xyz")).toBeUndefined();
  expect(parseOrigin(undefined)).toBeUndefined();
});

describe("filtro de gastos com estornos", () => {
  const entries = buildMonthEntries(
    [
      conta({ id: "g", valor: -8000, categoryId: "alim" }),
      conta({ id: "e", tipo: "ESTORNO", valor: 5000, categoryId: "alim", formaPagamento: null }),
      conta({ id: "r", tipo: "RECEITA", valor: 10000, categoryId: null, formaPagamento: null }),
      conta({ id: "m", tipo: "MOVIMENTACAO", valor: -2000, categoryId: null, formaPagamento: null }),
    ],
    [],
  );

  test("filtro GASTO inclui estornos e soma igual ao resumo", () => {
    const gastos = filterEntries(entries, { tipo: "GASTO" });
    expect(gastos.map((e) => e.id).sort()).toEqual(["e", "g"]);
    const resumo = summarizeSpending(entries, [{ id: "alim", nome: "Alimentação", cor: "#f00" }]);
    expect(-entriesTotal(gastos)).toBe(resumo.total);
    expect(resumo.total).toBe(3000);
  });

  test("filtro ESTORNO traz só estornos", () => {
    expect(filterEntries(entries, { tipo: "ESTORNO" }).map((e) => e.id)).toEqual(["e"]);
  });
});
