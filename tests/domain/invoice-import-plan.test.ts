import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  buildInvoiceImportPlan,
  InvoiceAlreadyImportedError,
  type CardState,
  type InvoiceImportPlan,
} from "@/domain/invoice-import-plan";
import { resolveLines } from "@/domain/invoice-lines";
import { parsePicPayInvoice } from "@/domain/picpay-invoice-parser";

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));
const EMPTY: CardState = { importedMonths: [], purchases: [] };

const september = parsePicPayInvoice(readFileSync("tests/fixtures/picpay-fatura-092026.txt", "utf8").split(/\r?\n/));

function plan(lines: string[] | typeof september, state: CardState = EMPTY, rules = [] as { padrao: string; categoryId: string }[]) {
  const parsed = Array.isArray(lines) ? parsePicPayInvoice(lines) : lines;
  return buildInvoiceImportPlan(parsed, resolveLines(parsed), state, rules);
}

/** Fatura sintética de outubro/2026 no mesmo formato do PDF. */
const october = (...lancamentos: string[]) => {
  const total = lancamentos
    .map((l) => l.match(/ ([\d.]+),(\d{2})$/))
    .filter((m) => m !== null)
    .reduce((s, m) => s + Number(m[1].replace(/\./g, "")) * 100 + Number(m[2]), 0);
  const fmt = `${Math.floor(total / 100)},${String(total % 100).padStart(2, "0")}`;
  return [
    "Vencimento: 05/11/2026 | Fechamento: 29/10/2026",
    "Picpay Card",
    "Transações Nacionais",
    ...lancamentos,
    `Total geral dos lançamentos ${fmt}`,
  ];
};

/** Estado do cartão como o banco ficaria após gravar o plano (ids = chave + número). */
function stateAfter(p: InvoiceImportPlan): CardState {
  return {
    importedMonths: [p.mes],
    purchases: p.novas.map((n) => ({
      id: n.chave,
      chave: n.chave,
      descricao: n.descricao,
      parcelas: n.parcelas,
      installments: n.installments.map((i) => ({
        id: `${n.descricao}#${i.numero}`,
        numero: i.numero,
        mes: i.mes,
        valor: n.valorParcela,
        confirmada: i.confirmada,
        cancelada: false,
      })),
    })),
  };
}

describe("first import", () => {
  const p = plan(september);
  const nova = (desc: string) => p.novas.find((n) => n.descricao === desc)!;

  test("creates installment purchases with projections", () => {
    expect(p.mes).toBe("2026-09");
    expect(nova("AMAZON BR")).toMatchObject({ parcelaInicial: 8, parcelas: 10, valorParcela: 23088, tipo: "COMPRA" });
    expect(nova("AMAZON BR").installments).toEqual([
      { numero: 8, mes: "2026-09", confirmada: true },
      { numero: 9, mes: "2026-10", confirmada: false },
      { numero: 10, mes: "2026-11", confirmada: false },
    ]);
  });

  test("creates a single confirmed installment for one-off purchases", () => {
    const google = p.novas.find((n) => n.descricao === "GOOGLE" && n.valorParcela === 2399)!;
    expect(google.installments).toEqual([{ numero: 1, mes: "2026-09", confirmada: true }]);
  });

  test("payment marks the previous invoice instead of creating a purchase", () => {
    expect(p.novas.some((n) => n.descricao === "PAGAMENTO DE FATURA")).toBe(false);
    expect(p.pagarMes).toBe("2026-08");
    expect(p.pagaEm).toEqual(d(2026, 9, 5));
  });

  test("a refund is a negative purchase", () => {
    expect(nova("CREDITO PULA COMPRA")).toMatchObject({ tipo: "ESTORNO", valorParcela: -319900, parcelas: 1 });
  });

  test("keeps the card final", () => {
    expect(nova("AMAZON BR").cartaoFinal).toBe("9083");
  });
});

describe("next month", () => {
  const state = stateAfter(plan(september));

  test("confirms the projected installment instead of creating a purchase", () => {
    const p = plan(october("21/02 AMAZON BR PARC09/10 230,88"), state);
    expect(p.confirmar).toContainEqual({ installmentId: "AMAZON BR#9" });
    expect(p.novas.some((n) => n.descricao === "AMAZON BR")).toBe(false);
  });

  test("cancels projections that did not come, with the following ones", () => {
    const p = plan(october("21/02 AMAZON BR PARC09/10 230,88"), state);
    expect(p.cancelar).toContainEqual({ installmentId: "MERCADOLIVRE*M#5", descricao: "MERCADOLIVRE*M", numero: 5, parcelas: 10 });
    expect(p.cancelar.map((c) => c.installmentId)).toContain("MERCADOLIVRE*M#10");
    expect(p.cancelar.some((c) => c.installmentId.startsWith("AMAZON BR"))).toBe(false);
  });

  test("ignores a one-off line already imported", () => {
    const p = plan(october("13/09 GOOGLE 23,99"), state);
    expect(p.novas).toHaveLength(0);
    expect(p.ignoradas).toBe(1);
  });

  test("moves a projection to the month it actually came", () => {
    const shifted: CardState = {
      importedMonths: ["2026-09"],
      purchases: [
        {
          id: "p1",
          chave: "AMAZON BR|2026-02-21|10|23088|0",
          descricao: "AMAZON BR",
          parcelas: 10,
          installments: [
            { id: "i8", numero: 8, mes: "2026-09", valor: 23088, confirmada: true, cancelada: false },
            { id: "i9", numero: 9, mes: "2026-11", valor: 23088, confirmada: false, cancelada: false },
            { id: "i10", numero: 10, mes: "2026-12", valor: 23088, confirmada: false, cancelada: false },
          ],
        },
      ],
    };
    const p = plan(october("21/02 AMAZON BR PARC09/10 230,88"), shifted);
    expect(p.confirmar).toEqual([{ installmentId: "i9" }]);
    expect(p.mover).toEqual([
      { installmentId: "i9", mes: "2026-10" },
      { installmentId: "i10", mes: "2026-11" },
    ]);
    expect(p.cancelar).toEqual([]);
  });
});

test("refuses an already imported month, named by its due month like the bank", () => {
  // Fecha em 29/09 e vence em 05/10: para o usuário é a fatura de outubro.
  expect(() => plan(september, { importedMonths: ["2026-09"], purchases: [] })).toThrow(
    "A fatura de outubro de 2026 já foi importada",
  );
  expect(new InvoiceAlreadyImportedError("2026-09").message).toBe("A fatura de setembro de 2026 já foi importada");
});

test("applies category rules on the description without PARC", () => {
  const p = plan(september, EMPTY, [{ padrao: "AMAZON", categoryId: "c1" }]);
  expect(p.novas.find((n) => n.descricao === "AMAZON BR")!.categoryId).toBe("c1");
  expect(p.semCategoria).toBe(p.novas.filter((n) => n.categoryId === null).length);
  expect(p.semCategoria).toBeGreaterThan(0);
});

test("a refund arriving in a later invoice is a new purchase, not the original one", () => {
  const sep = plan(october("10/10 LOJA X 100,00").map((l) => l.replace("05/11/2026 | Fechamento: 29/10/2026", "05/10/2026 | Fechamento: 29/09/2026").replace("10/10 LOJA", "10/09 LOJA")));
  const p = plan(october("10/09 LOJA X -100,00"), stateAfter(sep));
  expect(p.novas).toHaveLength(1);
  expect(p.novas[0]).toMatchObject({ tipo: "ESTORNO", valorParcela: -10000 });
  expect(p.ignoradas).toBe(0);
});

test("refuses a month older than the latest imported", () => {
  expect(() => plan(september, { importedMonths: ["2026-10"], purchases: [] })).toThrow(
    "Importe as faturas em ordem: a de novembro de 2026 já foi importada",
  );
});

describe("installment value differs by the rounding remainder", () => {
  // Setembro: MERCADOLIVRE*M 1/10 por 146,47 (sobra na 1ª); outubro: 2/10 por 146,43.
  const state = stateAfter(plan(september));
  const p = plan(october("16/09 MERCADOLIVRE*MPARC02/10 146,43"), state);

  test("still recognizes the same purchase", () => {
    expect(p.novas.some((n) => n.descricao === "MERCADOLIVRE*M" && n.parcelas === 10 && n.parcelaInicial === 2)).toBe(false);
    expect(p.confirmar).toContainEqual({ installmentId: "MERCADOLIVRE*M#2" });
    expect(p.cancelar.map((c) => c.installmentId)).not.toContain("MERCADOLIVRE*M#2");
  });

  test("updates the confirmed and the following projected installments to the real value", () => {
    expect(p.ajustarValor).toContainEqual({ installmentId: "MERCADOLIVRE*M#2", valor: 14643 });
    expect(p.ajustarValor).toContainEqual({ installmentId: "MERCADOLIVRE*M#10", valor: 14643 });
  });
});

describe("late and anticipated installments", () => {
  const purchase = (installments: { n: number; mes: string; confirmada?: boolean; cancelada?: boolean }[]): CardState => ({
    importedMonths: ["2026-09"],
    purchases: [
      {
        id: "p1",
        chave: "AMAZON BR|2026-02-21|10|23088|0",
        descricao: "AMAZON BR",
        parcelas: 10,
        installments: installments.map((i) => ({
          id: `i${i.n}`,
          numero: i.n,
          mes: i.mes,
          valor: 23088,
          confirmada: i.confirmada ?? false,
          cancelada: i.cancelada ?? false,
        })),
      },
    ],
  });

  test("a late installment reactivates a purchase cancelled the month before", () => {
    const state = purchase([
      { n: 8, mes: "2026-08", confirmada: true },
      { n: 9, mes: "2026-09", cancelada: true },
      { n: 10, mes: "2026-10", cancelada: true },
    ]);
    const p = plan(october("21/02 AMAZON BR PARC09/10 230,88"), state);
    expect(p.novas).toHaveLength(0);
    expect(p.confirmar).toEqual([{ installmentId: "i9" }]);
    expect(p.reativar).toEqual([{ installmentId: "i9" }, { installmentId: "i10" }]);
    expect(p.mover).toEqual([
      { installmentId: "i9", mes: "2026-10" },
      { installmentId: "i10", mes: "2026-11" },
    ]);
  });

  test("several installments of the same purchase in one invoice are all confirmed in it", () => {
    const state = purchase([
      { n: 8, mes: "2026-09", confirmada: true },
      { n: 9, mes: "2026-10" },
      { n: 10, mes: "2026-11" },
    ]);
    const p = plan(october("21/02 AMAZON BR PARC09/10 230,88", "21/02 AMAZON BR PARC10/10 230,88"), state);
    expect(p.novas).toHaveLength(0);
    expect(p.confirmar).toEqual([{ installmentId: "i9" }, { installmentId: "i10" }]);
    expect(p.mover.at(-1)).toEqual({ installmentId: "i10", mes: "2026-10" });
  });
});
