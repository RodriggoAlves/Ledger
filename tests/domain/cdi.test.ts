import { describe, expect, test } from "vitest";
import { CDI_PADRAO, parseBcbCdi, resolveCdi, shouldFetch } from "@/domain/cdi";

describe("parseBcbCdi", () => {
  test("lê a resposta da série 4389", () => {
    expect(parseBcbCdi([{ data: "31/10/2026", valor: "14.90" }])).toEqual({ data: "2026-10-31", taxaAnual: 1490 });
  });

  test("usa o último item quando vierem vários", () => {
    expect(
      parseBcbCdi([
        { data: "30/10/2026", valor: "14.80" },
        { data: "31/10/2026", valor: "14.9" },
      ]),
    ).toEqual({ data: "2026-10-31", taxaAnual: 1490 });
  });

  test("rejects unexpected payload", () => {
    expect(() => parseBcbCdi([])).toThrow();
    expect(() => parseBcbCdi({})).toThrow();
    expect(() => parseBcbCdi(null)).toThrow();
    expect(() => parseBcbCdi([{ data: "x", valor: "14.90" }])).toThrow();
    expect(() => parseBcbCdi([{ data: "31/10/2026", valor: "14,90" }])).toThrow();
  });
});

describe("shouldFetch", () => {
  const now = new Date("2026-11-03T15:00:00Z");

  test("nunca buscou", () => {
    expect(shouldFetch(null, now)).toBe(true);
  });

  test("já buscou hoje", () => {
    expect(shouldFetch(new Date("2026-11-03T12:00:00Z"), now)).toBe(false);
  });

  test("buscou ontem", () => {
    expect(shouldFetch(new Date("2026-11-02T12:00:00Z"), now)).toBe(true);
  });

  test("compara o dia no relógio de São Paulo", () => {
    // 23:30 de 02/11 em SP = 02:30 UTC de 03/11; 01:00 UTC de 03/11 = 22:00 de 02/11 em SP.
    expect(shouldFetch(new Date("2026-11-03T01:00:00Z"), new Date("2026-11-03T02:30:00Z"))).toBe(false);
  });
});

describe("resolveCdi", () => {
  const cached = { data: "2026-10-31", taxaAnual: 1490 };

  test("taxa manual vence", () => {
    expect(resolveCdi({ override: 1200, cached })).toEqual({ taxaAnual: 1200, fonte: "MANUAL", data: null });
  });

  test("usa o cache do Banco Central", () => {
    expect(resolveCdi({ override: null, cached })).toEqual({ taxaAnual: 1490, fonte: "BCB", data: "2026-10-31" });
  });

  test("sem nada usa o padrão", () => {
    expect(resolveCdi({ override: null, cached: null })).toEqual({ taxaAnual: CDI_PADRAO, fonte: "PADRAO", data: null });
  });
});
