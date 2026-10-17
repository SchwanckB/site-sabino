import 'server-only';

import { getRedis, redisKeys } from '@/lib/redis';
import { asString, isRecord } from '@/lib/repositories/parse';

/**
 * Diário de aula: o que foi treinado em cada sessão.
 *
 * Serve a três coisas que o professor hoje resolve de memória: não repetir a
 * mesma técnica duas semanas seguidas, saber o que o aluno perdeu quando
 * faltou, e montar a progressão da turma olhando para trás.
 *
 * Uma entrada por turma e dia. Salvar de novo no mesmo dia substitui — o
 * professor escreve no fim da aula, às vezes em duas tentativas, e versionar
 * isso não ajudaria ninguém.
 */

export interface ClassLogEntry {
  /** `YYYY-MM-DD` — dia civil em São Paulo. */
  readonly date: string;
  readonly text: string;
  /** Id de quem escreveu. */
  readonly author: string;
  readonly updatedAt: string;
}

/** Quantas sessões ficam guardadas por turma. */
const MAX_ENTRIES = 60;
const MAX_TEXT = 1200;

function parseEntry(value: unknown): ClassLogEntry | null {
  const row = typeof value === 'string' ? safeParse(value) : value;
  if (!isRecord(row)) return null;

  const date = asString(row['date']);
  const text = asString(row['text']);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || text.length === 0) return null;

  return {
    date,
    text,
    author: asString(row['author']),
    updatedAt: asString(row['updatedAt']),
  };
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function listClassLog(
  classId: string,
  limit = 10,
): Promise<ClassLogEntry[]> {
  const redis = getRedis();
  if (!redis || classId.length === 0) return [];

  try {
    const raw = await redis.lrange<unknown>(redisKeys.classLog(classId), 0, limit - 1);
    const entries: ClassLogEntry[] = [];

    for (const item of raw) {
      const entry = parseEntry(item);
      if (entry) entries.push(entry);
    }

    return entries;
  } catch (error) {
    console.error('[classLog] falha ao ler o diário', error);
    return [];
  }
}

export type ClassLogResult =
  | { readonly ok: true; readonly entry: ClassLogEntry }
  | { readonly ok: false; readonly error: string };

export async function saveClassLog(
  classId: string,
  date: string,
  text: string,
  author: string,
  now: Date,
): Promise<ClassLogResult> {
  const redis = getRedis();
  if (!redis) return { ok: false, error: 'Banco de dados não configurado.' };

  const limpo = text.trim().slice(0, MAX_TEXT);
  if (classId.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: 'Turma ou data inválida.' };
  }
  if (limpo.length === 0) {
    return { ok: false, error: 'Escreva o que foi treinado.' };
  }

  const entry: ClassLogEntry = {
    date,
    text: limpo,
    author,
    updatedAt: now.toISOString(),
  };

  // Reescrever o dia é o caso comum; a lista é curta, então reler e regravar
  // sai mais simples e previsível do que caçar o índice dentro do Redis.
  const atuais = await listClassLog(classId, MAX_ENTRIES);
  const proximos = [entry, ...atuais.filter((item) => item.date !== date)]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_ENTRIES);

  const key = redisKeys.classLog(classId);
  await redis.del(key);
  if (proximos.length > 0) {
    await redis.rpush(key, ...proximos.map((item) => JSON.stringify(item)));
  }

  return { ok: true, entry };
}
