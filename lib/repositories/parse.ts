import 'server-only';

/**
 * Coerção defensiva do que volta do Redis.
 *
 * O cliente `@upstash/redis` tenta desserializar JSON sozinho: `"123"` volta
 * como número e `"null"` volta como `null`. Um nome de aluno igual a "null" ou
 * um CPF com zeros à esquerda quebrariam silenciosamente se a gente confiasse
 * no tipo bruto. Tudo que sai do banco passa por aqui.
 */

export function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return fallback;
}

export function asNullableString(value: unknown): string | null {
  const text = asString(value, '');
  return text.length > 0 ? text : null;
}

export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function asInteger(value: unknown, fallback = 0): number {
  return Math.trunc(asNumber(value, fallback));
}

export function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

/** Lê um campo gravado como JSON (array ou objeto), tolerando string crua. */
export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string' && value.length > 0) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      // Formato antigo: lista separada por vírgula.
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

/** Restringe um valor a um conjunto conhecido. */
export function asEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const text = asString(value, '');
  return (allowed as readonly string[]).includes(text) ? (text as T) : fallback;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Hash vazio ou inexistente vira `null`. */
export function emptyToNull(
  value: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!value) return null;
  return Object.keys(value).length > 0 ? value : null;
}
