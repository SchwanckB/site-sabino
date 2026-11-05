import 'server-only';

import { getRedis, redisKeys } from '@/lib/redis';
import { asInteger, asString } from '@/lib/repositories/parse';
import type { CheckinEntry, CheckinSource, StudentRecord } from '@/types/domain';
import {
  saoPauloDateString,
  saoPauloDayRange,
  saoPauloMonthString,
  secondsUntilSaoPauloMidnight,
} from '@/utils/datetime';

/**
 * Presença e ranking.
 *
 * A regra é **uma presença por aluno, por dia, por turma**: presença se dá por
 * aula realizada, então quem treina a das 19:30 e fica para a das 20:30 tem
 * duas. O que não pode é a mesma aula contar duas vezes.
 *
 * Já foi uma por dia, e isso produzia dois defeitos de uma vez: o aluno de
 * duas aulas seguidas contava uma só, e a tela da chamada marcava como
 * presente em **qualquer** turma aberta — inclusive numa de outro dia da
 * semana, já que a pergunta que ela sabia responder era "veio hoje?" e não
 * "veio nesta aula?".
 *
 * A trava não é um `GET` seguido de `SET` — isso abriria uma janela de corrida
 * entre dois cliques. É o próprio `SET NX`: só o primeiro grava naquela turma,
 * e o retorno `null` já significa "já registrou". O histórico e os quatro
 * rankings vêm depois, em transação.
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

  // Trava atômica da aula: se já existe, nada mais acontece.
  const acquired = await redis.set(
    redisKeys.checkinLock(student.id, date, input.classId),
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

/**
 * Desfaz uma presença — para quando o admin marca o aluno errado.
 *
 * `classId` diz **qual** presença daquele dia some. Sem ele, o aluno que
 * treinou duas aulas perderia a errada: a busca pegava a primeira entrada da
 * data, que é a mais recente, e não a que o professor clicou.
 */
export async function undoCheckin(
  student: StudentRecord,
  date: string,
  classId: string | null,
  now: Date,
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  const stored = await redis.get<unknown>(redisKeys.checkinLock(student.id, date, classId));
  if (stored === null) return false;

  const month = date.slice(0, 7);
  const entries = await listCheckins(student.id, 60);
  const alvo = classId && classId.length > 0 ? classId : null;
  const target = entries.find((entry) => entry.date === date && entry.classId === alvo);

  const tx = redis.multi();
  tx.del(redisKeys.checkinLock(student.id, date, classId));
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

/**
 * Presenças de hoje, **todas elas**, por aluno.
 *
 * Devolve lista e não entrada única: com a trava por turma o mesmo aluno pode
 * ter duas no dia, e as telas de chamada precisam saber de qual turma é cada
 * uma. Era aqui que nascia o "marquei uma aula e apareceu marcada na outra" —
 * a tela recebia "tem presença hoje" e pintava o check em qualquer turma
 * aberta.
 *
 * A leitura vem do histórico por faixa de instante, e não das travas: estas
 * agora estão espalhadas numa chave por turma, e varrê-las custaria um `GET`
 * por aluno **vezes** turma. Aqui continua um comando por aluno.
 */
export async function getTodayCheckins(
  userIds: readonly string[],
  now: Date,
): Promise<Map<string, CheckinEntry[]>> {
  const redis = getRedis();
  const present = new Map<string, CheckinEntry[]>();
  if (!redis || userIds.length === 0) return present;

  const { start, end } = saoPauloDayRange(now);

  const pipeline = redis.pipeline();
  for (const id of userIds) {
    // `end - 1`: meia-noite cheia já é presença do dia seguinte.
    pipeline.zrange(redisKeys.checkins(id), start, end - 1, { byScore: true });
  }

  const rows = await pipeline.exec<unknown[][]>();

  rows.forEach((row, index) => {
    const id = userIds[index];
    if (!id || !Array.isArray(row) || row.length === 0) return;

    const entries: CheckinEntry[] = [];
    for (const item of row) {
      const parsed = typeof item === 'string' ? safeParse(item) : item;
      if (parsed && typeof parsed === 'object') {
        entries.push(toEntry(parsed as Record<string, unknown>));
      }
    }

    if (entries.length > 0) present.set(id, entries);
  });

  return present;
}

/**
 * A presença de um aluno **numa turma**, entre as de hoje.
 *
 * Existe para que nenhuma tela volte a perguntar "ele veio hoje?" quando a
 * pergunta é "ele veio nesta aula?". As duas têm respostas diferentes desde
 * que a presença passou a ser por aula realizada.
 */
export function checkinInClass(
  todays: ReadonlyMap<string, readonly CheckinEntry[]>,
  userId: string,
  classId: string,
): CheckinEntry | null {
  return todays.get(userId)?.find((entry) => entry.classId === classId) ?? null;
}

/**
 * `true` se o aluno tem ao menos uma presença hoje, em **qualquer** turma.
 *
 * Granularidade de dia, de propósito: serve a quem pergunta "ele passou pela
 * academia hoje?". Quem pergunta "ele fez esta aula?" usa
 * {@link checkinInClass} — confundir as duas foi o que pintava o check verde
 * na chamada da turma errada.
 */
export async function hasCheckedInToday(userId: string, now: Date): Promise<boolean> {
  const todays = await getTodayCheckins([userId], now);
  return (todays.get(userId)?.length ?? 0) > 0;
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
