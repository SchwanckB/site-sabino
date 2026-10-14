/** Concatena classes condicionais sem dependencia externa. */
export function cn(...values: readonly (string | false | null | undefined)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(' ');
}

/**
 * Iniciais para avatares sem foto (maximo duas letras).
 * Ignora tokens que nao comecam com letra - sufixos entre parenteses,
 * numeros e pontuacao nao viram inicial.
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((part) => /^\p{L}/u.test(part));
  if (parts.length === 0) return '?';

  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';

  return (first + last).toUpperCase();
}

/** `2025-03-09` -> `09/03/2025`. Entrada ja em data civil, sem conversao de fuso. */
export function formatBrDate(isoDate: string | null): string {
  if (!isoDate) return '--';

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;

  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/** Pluralizacao simples em pt-BR: `pluralize(1, 'dia', 'dias')`. */
export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}
