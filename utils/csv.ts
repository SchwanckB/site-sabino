/**
 * Geração de CSV para o Excel brasileiro.
 *
 * Duas decisões que parecem detalhe e não são:
 *
 * 1. **Separador `;`** — o Excel em português usa ponto e vírgula. Com
 *    vírgula, a planilha abre tudo numa coluna só e o contador devolve o
 *    arquivo.
 * 2. **BOM UTF-8** — sem ele o Excel no Windows lê o arquivo como ANSI e
 *    "Três Cachoeiras" vira "TrÃªs Cachoeiras".
 *
 * Função pura: recebe linhas, devolve texto. Quem monta a resposta HTTP é a
 * rota.
 */

export const CSV_SEPARATOR = ';';
export const CSV_BOM = '﻿';

/**
 * Escapa um valor de célula.
 *
 * Um campo que contenha o separador, aspas ou quebra de linha precisa vir
 * entre aspas, com as aspas internas duplicadas — é o que a RFC 4180 manda e
 * o que impede que uma observação com ponto e vírgula desloque as colunas.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  const text = String(value);
  if (text.length === 0) return '';

  const precisaAspas =
    text.includes(CSV_SEPARATOR) ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r');

  return precisaAspas ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Número no formato que a planilha brasileira entende (vírgula decimal). */
export function csvNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals).replace('.', ',');
}

/** Centavos em reais, pronto para a coluna de valor. */
export function csvCents(cents: number): string {
  return csvNumber(cents / 100);
}

/**
 * Monta o arquivo inteiro.
 *
 * `\r\n` entre linhas: é o que a RFC pede e o que evita linha corrida em
 * versões antigas do Excel.
 */
export function buildCsv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  const linhas = [
    headers.map(csvCell).join(CSV_SEPARATOR),
    ...rows.map((row) => row.map(csvCell).join(CSV_SEPARATOR)),
  ];

  return CSV_BOM + linhas.join('\r\n') + '\r\n';
}

/**
 * Nome de arquivo seguro para o cabeçalho `Content-Disposition`.
 *
 * Acento e espaço no nome quebram o download em alguns navegadores; o que vai
 * no cabeçalho precisa ser ASCII simples.
 */
export function csvFilename(base: string, isoDate: string): string {
  const limpo = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return `${limpo}-${isoDate}.csv`;
}
