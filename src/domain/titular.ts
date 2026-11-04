import { normalize } from "./categorization";

/** Fica fora do componente "use client" para server components receberem o texto, não uma referência. */
export const NOME_EXTRATO_AJUDA = "Pix enviados ou recebidos com exatamente este nome são transferências entre suas contas.";

/** Nome do extrato informado pelo usuário, sem espaços nas pontas; vazio = não configurado. */
export function cleanNome(nome: string | null | undefined): string | null {
  const n = nome?.trim();
  return n ? n : null;
}

/**
 * A descrição é o próprio usuário (Pix entre suas contas)? Igualdade normalizada, nunca "contém":
 * "RODRIGGO ALVES AREBA LTDA" ou "No cofrinho …" não são o titular.
 */
export function isTitular(descricao: string, nome: string | null): boolean {
  const n = cleanNome(nome);
  return n !== null && normalize(descricao) === normalize(n);
}
