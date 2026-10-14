import 'server-only';

import { getRedis, redisKeys } from '@/lib/redis';
import { asInteger, asString } from '@/lib/repositories/parse';
import type { CheckinEntry, CheckinSource, StudentRecord } from '@/types/domain';
import {
  saoPauloDateString,
  saoPauloMonthString,
  secondsUntilSaoPauloMidnight,
} from '@/utils/datetime';

/**
 * Presença e ranking.
 *
 * A regra "1 check-in por aluno por dia" não é verificada com um `GET` seguido
 * de `SET` — isso abriria uma janela de corrida entre dois cliques. A trava é o
 * próprio `SET NX`: só o primeiro do dia grava, e o retorno `null` já significa
 * "já registrou". O histórico e os quatro rankings vêm depois, em transação.
 */

export interface RecordCheckinInput {
  readonly student: StudentRecord;
  readonly classId: string | null;
  readonly classTitle: string | null;
  readonly source: CheckinSource;
  readonly registeredBy: string;
}

export type RecordCheckinOutcome =
  | { readonly ok: true; readonly entry: CheckinEntry }
  | { readonly ok: false; readonly reason: 'ja_registrado' | 'sem_banco' };

/**
 * Registra a presença de um aluno no dia. Serve aos três modos: QR do aluno,
 * manual individual e manual em lote — muda apenas `source`.
 */
export async function recordCheckin(
  input: RecordCheckinInput,
  now: Date,
): Promise<RecordCheckinOutcome> {
  const redis = getRedis();
  if (!redis) return { ok: false, reason: 'sem_banco' };

  const { student } = input;
  const date = saoPauloDateString(now);
  const month = saoPauloMonthString(now);
  const timestamp = now.toISOString();

  const entry: CheckinEntry = {
    at: timestamp,
    date,
    classId: input.classId,
    classTitle: input.classTitle,
    source: input.source,
    registeredBy: input.registeredBy,
  };

  // Trava atômica do dia: se já existe, nada mais acontece.
  const acquired = await redis.set(
    redisKeys.checkinLock(student.id, date),
    JSON.stringify(entry),
    { nx: true, ex: secondsUntilSaoPauloMidnight(now) + 3600 },
  );

  if (acquired === null) {
    return { ok: false, reason: 'ja_registrado' };
  }

  const monthlyTtl = 60 * 60 * 24 * 400;

  const tx = redis.multi();
  tx.zadd(redisKeys.checkins(student.id), {
    score: now.getTime(),
    member: JSON.stringify(entry),
  });
  tx.zincrby(redisKeys.rankAll(), 1, student.id);
  tx.zincrby(redisKeys.rankMonth(month), 1, student.id);
  tx.zincrby(redisKeys.rankBelt(student.belt), 1, student.id);
  tx.zincrby(redisKeys.rankBeltMonth(student.belt, month), 1, student.id);
  tx.expire(redisKeys.rankMonth(month), monthlyTtl);
  tx.expire(redisKeys.rankBeltMonth(student.belt, month), monthlyTtl);
  await tx.exec();

  return { ok: true, entry };
}

/** Desfaz a presença do dia — para quando o admin marca o aluno errado. */
export async function undoCheckin(
  student: StudentRecord,
  date: string,
  now: Date,
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  const stored = await redis.get<unknown>(redisKeys.checkinLock(student.id, date));
  if (stored === null) return false;

  const month = date.slice(0, 7);
  const entries = await listCheckins(student.id, 60);
  const target = entries.find((entry) => entry.date === date);

  const tx = redis.multi();
  tx.del(redisKeys.checkinLock(student.id, date));
  if (target) {
    tx.zrem(redisKeys.checkins(student.id), JSON.stringify(target));
  }
  tx.zincrby(redisKeys.rankAll(), -1, student.id);
  tx.zincrby(redisKeys.rankMonth(month), -1, student.id);
  tx.zincrby(redisKeys.rankBelt(student.belt), -1, student.id);
  tx.zincrby(redisKeys.rankBeltMonth(student.belt, month), -1, student.id);
  await tx.exec();

  void now;
  return true;
}

/** Presença de hoje de vários alunos — alimenta a tela de presença em lote. */
export async function getTodayCheckins(
  userIds: readonly string[],
  now: Date,
): Promise<Map<string, CheckinEntry>> {
  const redis = getRedis();
  const present = new Map<string, CheckinEntry>();
  if (!redis || userIds.length === 0) return present;

  const date = saoPauloDateString(now);
  const pipeline = redis.pipeline();
  for (const id of userIds) {
    pipeline.get(redisKeys.checkinLock(id, date));
  }

  const rows = await pipeline.exec();

  rows.forEach((row, index) => {
    const id = userIds[index];
    if (!id || row === null || row === undefined) return;

    const parsed = typeof row === 'string' ? safeParse(row) : row;
    if (parsed && typeof parsed === 'object') {
      present.set(id, toEntry(parsed as Record<string, unknown>));
    }
  });

  return present;
}

export async function hasCheckedInToday(userId: string, now: Date): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  const value = await redis.get(redisKeys.checkinLock(userId, saoPauloDateString(now)));
  return value !== null && value !== undefined;
}

/** Histórico de presenças, da mais recente para a mais antiga. */
export async function listCheckins(userId: string, limit = 90): Promise<CheckinEntry[]> {
  const redis = getRedis();
  if (!redis) return [];

  const raw = await redis.zrange<unknown[]>(redisKeys.checkins(userId), 0, limit - 1, {
    rev: true,
  });

  const entries: CheckinEntry[] = [];
  for (const item of raw) {
    const parsed = typeof item === 'string' ? safeParse(item) : item;
    if (parsed && typeof parsed === 'object') {
      entries.push(toEntry(parsed as Record<string, unknown>));
    }
  }

  return entries;
}

export async function countCheckins(userId: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  return redis.zcard(redisKeys.checkins(userId));
}

export interface RankingRow {
  readonly userId: string;
  readonly score: number;
  readonly position: number;
}

/** Ranking geral ou mensal. `belt` restringe o recorte por faixa. */
export async function getRanking(
  options: { readonly month?: string; readonly belt?: string; readonly limit?: number },
): Promise<RankingRow[]> {
  const redis = getRedis();
  if (!redis) return [];

  const { month, belt, limit = 20 } = options;
  const key = belt
    ? month
      ? redisKeys.rankBeltMonth(belt, month)
      : redisKeys.rankBelt(belt)
    : month
      ? redisKeys.rankMonth(month)
      : redisKeys.rankAll();

  const raw = await redis.zrange<(string | number)[]>(key, 0, limit - 1, {
    rev: true,
    withScores: true,
  });

  const rows: RankingRow[] = [];
  for (let index = 0; index < raw.length; index += 2) {
    const userId = asString(raw[index]);
    const score = asInteger(raw[index + 1], 0);
    if (userId.length > 0 && score > 0) {
      rows.push({ userId, score, position: rows.length + 1 });
    }
  }

  return rows;
}

/** Posição do aluno no recorte, ou `null` se ele ainda não pontuou. */
export async function getRankingPosition(
  userId: string,
  options: { readonly month?: string; readonly belt?: string } = {},
): Promise<{ position: number; score: number } | null> {
  const redis = getRedis();
  if (!redis) return null;

  const { month, belt } = options;
  const key = belt
    ? month
      ? redisKeys.rankBeltMonth(belt, month)
      : redisKeys.rankBelt(belt)
    : month
      ? redisKeys.rankMonth(month)
      : redisKeys.rankAll();

  const [rank, score] = await Promise.all([
    redis.zrevrank(key, userId),
    redis.zscore(key, userId),
  ]);

  if (rank === null || rank === undefined || score === null || score === undefined) {
    return null;
  }

  return { position: Number(rank) + 1, score: Number(score) };
}

/* -------------------------------------------------------------------------- */

function toEntry(row: Record<string, unknown>): CheckinEntry {
  const source = asString(row['source'], 'manual');

  return {
    at: asString(row['at']),
    date: asString(row['date']),
    classId: asString(row['classId']) || null,
    classTitle: asString(row['classTitle']) || null,
    source: (['qr', 'manual', 'lote'] as const).includes(source as CheckinSource)
      ? (source as CheckinSource)
      : 'manual',
    registeredBy: asString(row['registeredBy']),
  };
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
