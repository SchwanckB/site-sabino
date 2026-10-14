/**
 * Limites de faixa de score para consultas `ZRANGE ... BYSCORE`.
 *
 * O protocolo REST do Upstash serializa o comando como JSON. `JSON.stringify`
 * converte `Infinity` e `-Infinity` em **`null`** — o comando chega ao servidor
 * como `["zrange","chave",null,123,"byscore"]` e o Redis responde
 * "min or max is not a float", derrubando a página que fez a consulta.
 *
 * Os literais `-inf` e `+inf` são o que o Redis espera e atravessam o JSON
 * intactos. Use sempre estas constantes no lugar de `Number.NEGATIVE_INFINITY`.
 */

export const SCORE_MIN = '-inf';
export const SCORE_MAX = '+inf';

/**
 * `true` quando o valor chega ao Redis como foi escrito.
 *
 * Serve de guarda em teste: qualquer limite que não sobreviva ao
 * `JSON.stringify` do cliente REST é um erro em produção, não um detalhe.
 */
export function survivesJsonTransport(value: unknown): boolean {
  const roundTripped: unknown = JSON.parse(JSON.stringify({ v: value })).v;
  return Object.is(roundTripped, value);
}
