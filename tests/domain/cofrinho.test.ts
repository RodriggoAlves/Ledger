import { describe, expect, test } from "vitest";
import { parseCofrinhoMovement } from "@/domain/cofrinho";

describe("parseCofrinhoMovement", () => {
  test("aporte vira valor positivo com o nome do cofrinho", () => {
    expect(
      parseCofrinhoMovement({
        tipoOriginal: "Dinheiro guardado",
        descricao: "No cofrinho Cofrinho Turbinado",
        valor: -201393,
      }),
    ).toEqual({ nome: "Cofrinho Turbinado", valor: 201393 });
  });

  test("resgate vira valor negativo", () => {
    expect(
      parseCofrinhoMovement({ tipoOriginal: "Dinheiro resgatado", descricao: "Do cofrinho Cofrinho Turbinado", valor: 3500 }),
    ).toEqual({ nome: "Cofrinho Turbinado", valor: -3500 });
  });

  test("ignora outros tipos", () => {
    expect(parseCofrinhoMovement({ tipoOriginal: "Pix enviado", descricao: "No cofrinho X", valor: -100 })).toBeNull();
  });

  test("sem prefixo usa a descrição aparada, sem diferenciar maiúsculas no tipo", () => {
    expect(parseCofrinhoMovement({ tipoOriginal: " DINHEIRO GUARDADO ", descricao: "  Viagem   2027 ", valor: -100 })).toEqual({
      nome: "Viagem 2027",
      valor: 100,
    });
  });

  test("prefixo sem diferenciar maiúsculas", () => {
    expect(parseCofrinhoMovement({ tipoOriginal: "Dinheiro guardado", descricao: "NO COFRINHO Reserva", valor: -1 })?.nome).toBe(
      "Reserva",
    );
  });
});
