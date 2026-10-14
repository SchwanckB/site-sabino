import 'server-only';

import { getRedis, redisKeys } from '@/lib/redis';
import { asInteger, asString } from '@/lib/repositories/parse';
import type { GraduationEntry, StudentRecord } from '@/types/domain';
import { saoPauloDateString } from '@/utils/datetime';
import {
  KIDS_GRADUATION_INTERVAL_DAYS,
  KIDS_TOTAL_DEGREES,
  getDegreeColor,
} from '@/utils/graduationEngine';

/**
 * Registro de graus e faixas.
 *
 * Toda graduação mexe em três lugares ao mesmo tempo: a ficha do aluno, o
 * histórico e o índice `graduation:due`. Por isso vai tudo em transação — um
 * grau registrado sem reagendar o índice faria o aluno aparecer como elegível
 * para sempre.
 */

function dayNumber(isoDate: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return 0;
  const [, year, month, day] = match;
  return Math.floor(Date.UTC(Number(year), Number(month) - 1, Number(day)) / 86_400_000);
}

/** Registra o próximo grau da trilha infantil. */
export async function registerDegree(
  student: StudentRecord,
  registeredBy: string,
  now: Date,
): Promise<{ ok: boolean; degree: number }> {
  const redis = getRedis();
  if (!redis) return { ok: false, degree: student.degree };

  const nextDegree = Math.min(student.degree + 1, KIDS_TOTAL_DEGREES);
  if (nextDegree === student.degree) {
    return { ok: false, degree: student.degree };
  }

  const timestamp = now.toISOString();

  const entry: GraduationEntry = {
    at: timestamp,
    fromBelt: student.belt,
    fromDegree: student.degree,
    toBelt: student.belt,
    toDegree: nextDegree,
    stripeColor: getDegreeColor(nextDegree),
    registeredBy,
    note: '',
  };

  const tx = redis.multi();
  tx.hset(redisKeys.user(student.id), {
    degree: nextDegree,
    lastGraduationAt: timestamp,
    updatedAt: timestamp,
  });
  tx.lpush(redisKeys.graduationHistory(student.id), JSON.stringify(entry));

  if (nextDegree >= KIDS_TOTAL_DEGREES) {
    // Completou a escada: a troca de faixa é decisão manual do professor.
    tx.zrem(redisKeys.graduationDue(), student.id);
  } else {
    tx.zadd(redisKeys.graduationDue(), {
      score: dayNumber(saoPauloDateString(now)) + KIDS_GRADUATION_INTERVAL_DAYS,
      member: student.id,
    });
  }

  await tx.exec();
  return { ok: true, degree: nextDegree };
}

/** Desfaz o último grau registrado, restaurando a âncora anterior. */
export async function undoLastDegree(
  student: StudentRecord,
  now: Date,
): Promise<{ ok: boolean; degree: number }> {
  const redis = getRedis();
  if (!redis) return { ok: false, degree: student.degree };

  const history = await listGraduationHistory(student.id, 2);
  const last = history[0];
  if (!last) return { ok: false, degree: student.degree };

  const previousDegree = last.fromDegree;
  const previousAnchor = history[1]?.at ?? student.joinedAt ?? now.toISOString();

  const tx = redis.multi();
  tx.hset(redisKeys.user(student.id), {
    degree: previousDegree,
    belt: last.fromBelt,
    lastGraduationAt: history[1]?.at ?? '',
    updatedAt: now.toISOString(),
  });
  tx.lpop(redisKeys.graduationHistory(student.id));
  tx.zadd(redisKeys.graduationDue(), {
    score: dayNumber(previousAnchor.slice(0, 10)) + KIDS_GRADUATION_INTERVAL_DAYS,
    member: student.id,
  });
  await tx.exec();

  return { ok: true, degree: previousDegree };
}

/** Promove de faixa (adulto ou infantil), zerando os graus. */
export async function promoteBelt(
  student: StudentRecord,
  toBelt: string,
  registeredBy: string,
  note: string,
  now: Date,
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  const timestamp = now.toISOString();

  const entry: GraduationEntry = {
    at: timestamp,
    fromBelt: student.belt,
    fromDegree: student.degree,
    toBelt,
    toDegree: 0,
    stripeColor: null,
    registeredBy,
    note,
  };

  const score = await redis.zscore(redisKeys.rankAll(), student.id);

  const tx = redis.multi();
  tx.hset(redisKeys.user(student.id), {
    belt: toBelt,
    degree: 0,
    lastGraduationAt: timestamp,
    updatedAt: timestamp,
  });
  tx.lpush(redisKeys.graduationHistory(student.id), JSON.stringify(entry));

  // O ranking por faixa acompanha a promoção.
  tx.zrem(redisKeys.rankBelt(student.belt), student.id);
  tx.zadd(redisKeys.rankBelt(toBelt), {
    score: typeof score === 'number' ? score : 0,
    member: student.id,
  });

  if (student.category === 'kids') {
    tx.zadd(redisKeys.graduationDue(), {
      score: dayNumber(saoPauloDateString(now)) + KIDS_GRADUATION_INTERVAL_DAYS,
      member: student.id,
    });
  }

  await tx.exec();
  return true;
}

export async function listGraduationHistory(
  userId: string,
  limit = 30,
): Promise<GraduationEntry[]> {
  const redis = getRedis();
  if (!redis) return [];

  const raw = await redis.lrange<unknown>(redisKeys.graduationHistory(userId), 0, limit - 1);

  const entries: GraduationEntry[] = [];
  for (const item of raw) {
    const parsed = typeof item === 'string' ? safeParse(item) : item;
    if (!parsed || typeof parsed !== 'object') continue;
    const row = parsed as Record<string, unknown>;

    entries.push({
      at: asString(row['at']),
      fromBelt: asString(row['fromBelt']),
      fromDegree: asInteger(row['fromDegree'], 0),
      toBelt: asString(row['toBelt']),
      toDegree: asInteger(row['toDegree'], 0),
      stripeColor: asString(row['stripeColor']) || null,
      registeredBy: asString(row['registeredBy']),
      note: asString(row['note']),
    });
  }

  return entries;
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
