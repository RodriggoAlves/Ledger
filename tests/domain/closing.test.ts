import { describe, expect, test } from "vitest";
import {
  closedPeriod,
  closingSteps,
  entriesSignature,
  incomeHint,
  monthStatus,
  pendingCount,
  titularChoiceToUpdate,
} from "@/domain/closing";
import type { TxType } from "@/domain/picpay-parser";
import { cartao, conta } from "./reports/helpers";

const nome = "RODRIGGO ALVES AREBA";
const eu = (valor: number, tipo: TxType = valor > 0 ? "RECEITA" : "GASTO", categoryId: string | null = null) =>
  conta(valor, { descricao: nome, tipo, categoryId });

describe("entriesSignature", () => {
  const a = conta(-100, { categoryId: "alim" });
  const b = cartao(-900);

  test("estável na ordem", () => {
    expect(entriesSignature([a, b])).toBe(entriesSignature([b, a]));
  });

  test("muda com valor, tipo, categoria, inclusão e remoção", () => {
    const base = entriesSignature([a, b]);
    const variacoes = [
      [{ ...a, valor: -101 }, b],
      [{ ...a, tipo: "ESTORNO" as const }, b],
      [{ ...a, categoryId: null }, b],
      [a, b, conta(-5)],
      [a],
    ];
    for (const v of variacoes) expect(entriesSignature(v)).not.toBe(base);
  });
});

describe("monthStatus", () => {
  const entries = [conta(-100), conta(500)];
  test("três estados", () => {
    expect(monthStatus(null, entries)).toBe("ABERTO");
    expect(monthStatus({ assinatura: entriesSignature(entries) }, entries)).toBe("FECHADO");
    expect(monthStatus({ assinatura: entriesSignature(entries) }, [...entries, conta(-1)])).toBe("ALTERADO");
  });
});

describe("closedPeriod", () => {
  const set = [conta(-100)];
  const ago = [conta(-200)];
  const out = [conta(-300)];
  const periodo = [
    { mes: "2026-08", entries: ago },
    { mes: "2026-09", entries: set },
    { mes: "2026-10", entries: out },
  ];

  test("mantém fechados e alterados, lista abertos", () => {
    const closings = new Map([
      ["2026-08", { assinatura: entriesSignature(ago) }],
      ["2026-09", { assinatura: "outra" }],
    ]);
    const r = closedPeriod(periodo, closings);
    expect(r.periodo.map((m) => m.mes)).toEqual(["2026-08", "2026-09"]);
    expect(r.abertos).toEqual(["2026-10"]);
    expect(r.alterados).toEqual(["2026-09"]);
  });

  test("tudo aberto dá período vazio (Review Focus 3)", () => {
    expect(closedPeriod(periodo, new Map())).toEqual({ periodo: [], abertos: ["2026-08", "2026-09", "2026-10"], alterados: [] });
  });
});

describe("closingSteps / pendingCount", () => {
  const recebido = eu(180000);
  const transferido = eu(221952, "MOVIMENTACAO", "transf");
  const enviado = eu(-2000);
  const entrada = conta(1200);
  const gasto = conta(-500);
  const doCartao = cartao(-900);
  const categorizado = conta(-300, { categoryId: "alim" });
  const entries = [recebido, transferido, enviado, entrada, gasto, doCartao, categorizado];
  const steps = closingSteps(entries, nome);

  test("separa os lançamentos de cada passo", () => {
    expect(steps.titular).toEqual([recebido, transferido, enviado]);
    expect(steps.entradas).toEqual([entrada]);
    expect(steps.gastos).toEqual([enviado, gasto, doCartao]);
  });

  test("lista todas as entradas e todos os gastos do mês, categorizados ou não, para revisão", () => {
    const salario = conta(500000, { categoryId: "sal" });
    const estorno = conta(300, { tipo: "ESTORNO", categoryId: "alim" });
    const s = closingSteps([...entries, salario, estorno], nome);
    expect(s.todasEntradas).toEqual([entrada, salario]);
    expect(s.todosGastos).toEqual([enviado, gasto, doCartao, categorizado, estorno]);
  });

  test("Pix enviado a você mesmo que segue gasto sem categoria aparece nos gastos e conta como pendência", () => {
    expect(steps.gastos).toContain(enviado);
  });

  test("conta pendências", () => {
    expect(pendingCount(steps)).toEqual({ titular: 1, entradas: 1, gastos: 3, total: 5 });
  });

  test("sem nome, nada é do titular", () => {
    const s = closingSteps(entries, null);
    expect(s.titular).toEqual([]);
    expect(s.entradas).toContain(recebido);
  });
});

describe("incomeHint", () => {
  test("soma o que veio do titular quando nada é renda", () => {
    expect(incomeHint([eu(180000, "MOVIMENTACAO", "transf"), eu(221952, "MOVIMENTACAO", "transf"), eu(-500, "MOVIMENTACAO", "transf")], nome)).toBe(401952);
  });

  test("salário picado com uma parte marcada não avisa (Review Focus 5)", () => {
    expect(incomeHint([eu(180000, "RECEITA", "sal"), eu(221952, "MOVIMENTACAO", "transf")], nome)).toBeNull();
  });

  test("sem titular ou sem Pix recebido", () => {
    expect(incomeHint([eu(180000, "MOVIMENTACAO", "transf")], null)).toBeNull();
    expect(incomeHint([eu(-180000, "MOVIMENTACAO", "transf"), conta(5000)], nome)).toBeNull();
  });
});

describe("titularChoiceToUpdate", () => {
  test("transferência e receita para Pix recebido", () => {
    expect(titularChoiceToUpdate("TRANSFERENCIA", 100, "transf", ["sal"])).toEqual({ tipo: "MOVIMENTACAO", categoryId: "transf" });
    expect(titularChoiceToUpdate({ categoryId: "sal" }, 100, "transf", ["sal"])).toEqual({ tipo: "RECEITA", categoryId: "sal" });
  });

  test("Pix enviado não vira salário (Review Focus 4)", () => {
    expect(titularChoiceToUpdate({ categoryId: "sal" }, -100, "transf", ["sal"])).toBeNull();
  });

  test("gasto só para Pix enviado", () => {
    expect(titularChoiceToUpdate("GASTO", -100, "transf", ["sal"])).toEqual({ tipo: "GASTO", categoryId: null });
    expect(titularChoiceToUpdate("GASTO", 100, "transf", ["sal"])).toBeNull();
  });

  test("categoria que não é de receita é recusada", () => {
    expect(titularChoiceToUpdate({ categoryId: "alim" }, 100, "transf", ["sal"])).toBeNull();
  });
});
