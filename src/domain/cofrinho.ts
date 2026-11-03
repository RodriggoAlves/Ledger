/** Tipos do extrato do PicPay que movem dinheiro entre a conta e um cofrinho. */
export const COFRINHO_TIPOS = ["Dinheiro guardado", "Dinheiro resgatado"] as const;

const PREFIXO = /^(no|do)\s+cofrinho\s+/i;

/**
 * Movimento de cofrinho a partir de uma linha do extrato.
 * `valor` do resultado é do ponto de vista do cofrinho: aporte positivo, resgate negativo.
 */
export function parseCofrinhoMovement(t: {
  tipoOriginal: string;
  descricao: string;
  valor: number;
}): { nome: string; valor: number } | null {
  const tipo = t.tipoOriginal.trim().toLowerCase();
  if (!COFRINHO_TIPOS.some((c) => c.toLowerCase() === tipo)) return null;
  const limpo = t.descricao.trim().replace(/\s+/g, " ");
  return { nome: limpo.replace(PREFIXO, "") || limpo, valor: -t.valor };
}
