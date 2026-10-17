/**
 * Normalização de texto para busca.
 *
 * Mora fora do componente de propósito: o servidor monta o índice e o cliente
 * normaliza o que o professor digita. Exportar isto de um módulo `'use
 * client'` compila, mas quebra em produção — o servidor não consegue chamar
 * uma função que vive do lado do cliente, e a página inteira vira 500.
 */

/** Minúsculas e sem acento — "João" tem de ser achado por "joao". */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Junta os campos buscáveis de alguém num texto só, já normalizado. */
export function buildHaystack(parts: readonly (string | null | undefined)[]): string {
  return normalizeSearch(parts.filter(Boolean).join(' '));
}
