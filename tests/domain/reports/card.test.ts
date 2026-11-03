import { describe, expect, test } from "vitest";
import { futureCommitment, installmentMix, type UnpaidInstallment } from "@/domain/reports/card";
import { cartao, conta } from "./helpers";

const venc = (mes: string) => new Date(`${mes}-05T00:00:00Z`);
const row = (mes: string, o: Partial<UnpaidInstallment>): UnpaidInstallment => ({
  mes,
  vencimento: venc(mes),
  status: "PROJETADA",
  purchaseId: "p1",
  descricao: "TV",
  numero: 1,
  parcelas: 1,
  valor: 0,
  ...o,
});

describe("futureCommitment", () => {
  const rows = [
    row("2026-11", { status: "FECHADA", purchaseId: "tv", numero: 1, parcelas: 3, valor: 1000 }),
    row("2026-12", { purchaseId: "tv", numero: 2, parcelas: 3, valor: 1000 }),
    row("2027-01", { purchaseId: "tv", numero: 3, parcelas: 3, valor: 1000 }),
    row("2026-11", { status: "FECHADA", purchaseId: "pao", descricao: "Padaria", valor: 500 }),
  ];
  const r = futureCommitment(rows);

  test("faturas em ordem com parcelado e à vista", () => {
    expect(r.faturas.map((f) => [f.mes, f.total, f.parcelado, f.avista, f.status])).toEqual([
      ["2026-11", 1500, 1000, 500, "FECHADA"],
      ["2026-12", 1000, 1000, 0, "PROJETADA"],
      ["2027-01", 1000, 1000, 0, "PROJETADA"],
    ]);
    expect(r.total).toBe(3500);
  });

  test("parcelamentos ativos", () => {
    expect(r.parcelamentos).toEqual([
      {
        purchaseId: "tv",
        descricao: "TV",
        valorParcela: 1000,
        proxima: 1,
        parcelas: 3,
        restantes: 3,
        restante: 3000,
        ultimoVencimento: venc("2027-01"),
      },
    ]);
  });

  test("livre das parcelas após a última fatura com parcela", () => {
    expect(r.livreEm).toEqual(venc("2027-01"));
  });

  test("sem parcelas", () => {
    expect(futureCommitment([])).toEqual({ faturas: [], parcelamentos: [], livreEm: null, total: 0 });
  });
});

describe("installmentMix", () => {
  test("à vista × parcelado no cartão", () => {
    expect(
      installmentMix([
        { mes: "2026-10", entries: [cartao(-300, { parcela: [2, 10] }), cartao(-200), cartao(50), conta(-999)] },
      ]),
    ).toEqual([{ mes: "2026-10", avista: 150, parcelado: 300 }]);
  });
});
