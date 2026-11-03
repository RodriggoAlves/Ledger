import { describe, expect, test } from "vitest";
import { entriesToCsv } from "@/domain/reports/csv";
import { cartao, cats, conta } from "./helpers";

const HEADER = "Data;Mês;Descrição;Tipo;Categoria;Origem;Parcela;Valor";

describe("entriesToCsv", () => {
  test("BOM, cabeçalho e linhas do mais antigo para o mais novo", () => {
    const csv = entriesToCsv(
      [
        { mes: "2026-10", entries: [conta(-1234, { categoryId: "alim", descricao: "Mercado", data: "2026-10-31" })] },
        { mes: "2026-11", entries: [cartao(-50000, { descricao: "TV", parcela: [2, 10], data: "2026-09-15" })] },
      ],
      cats,
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual([
      HEADER,
      "31/10/2026;2026-10;Mercado;Gasto;Alimentação;Conta;;-12,34",
      "15/09/2026;2026-11;TV;Gasto;;Cartão;2/10;-500,00",
    ]);
  });

  test("dentro do mês, mais antigo primeiro", () => {
    const csv = entriesToCsv(
      [{ mes: "2026-10", entries: [conta(-1, { descricao: "B", data: "2026-10-20" }), conta(-1, { descricao: "A", data: "2026-10-02" })] }],
      cats,
    );
    expect(csv.split("\r\n").slice(1).map((l) => l.split(";")[2])).toEqual(["A", "B"]);
  });

  test("escapes separators and quotes", () => {
    const csv = entriesToCsv([{ mes: "2026-10", entries: [conta(100, { descricao: 'a;"b"\nc' })] }], cats);
    expect(csv).toContain(';"a;""b""\nc";');
  });

  test("sem lançamentos só tem o cabeçalho", () => {
    expect(entriesToCsv([], cats)).toBe(`﻿${HEADER}`);
  });
});
