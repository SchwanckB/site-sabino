import 'server-only';

import { MODALITY_IDS, type ModalityId } from '@/data/seed';
import { getRedis, redisKeys } from '@/lib/redis';
import { asInteger, asString } from '@/lib/repositories/parse';
import type { CheckinEntry, CheckinSource, StudentRecord } from '@/types/domain';
import {
  saoPauloDateString,
  saoPauloDayRange,
  saoPauloDayRangeOf,
  saoPauloInstant,
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

/** Narrowing do valor lido do banco ou recebido do chamador. */
function isModality(value: unknown): value is ModalityId {
  return typeof value === 'string' && (MODALITY_IDS as readonly string[]).includes(value);
}

export interface RecordCheckinInput {
  readonly student: StudentRecord;
  readonly classId: string | null;
  readonly classTitle: string | null;
  /**
   * Modalidade da aula, para o ranking por modalidade.
   *
   * Ausente quando a presença entrou sem turma resolvida. Aí ela conta no
   * ranking geral e em nenhum dos por modalidade — contá-la num deles
   * exigiria adivinhar em qual, e um ponto no ranking errado é pior que um
   * ponto a menos.
   */
  readonly modality?: ModalityId | null;
  readonly source: CheckinSource;
  readonly registeredBy: string;
  /**
   * Dia da presença (`YYYY-MM-DD`), quando não é hoje.
   *
   * A chamada atrasada é o caso: o professor lembra na quinta que a turma da
   * manhã de quarta não foi lançada. Sem isto a presença entrava com a data em
   * que foi digitada, e o dia do treino ficava vazio para sempre.
   */
  readonly onDate?: string;
  /**
   * Horário do treino (`HH:mm`) na data retroativa — o início da turma.
   *
   * O instante gravado precisa cair **dentro** daquele dia: as presenças do
   * dia são lidas por faixa de epoch no histórico, e um `at` de hoje colado
   * numa data de ontem faria a presença de ontem aparecer na chamada de hoje.
   */
  readonly onTime?: string;
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
  const hoje = saoPauloDateString(now);

  // Presença retroativa: a data e o instante vêm do treino, não do relógio.
  const retroativa = input.onDate !== undefined && input.onDate !== hoje;
  const date = retroativa && input.onDate ? input.onDate : hoje;
  const quando = retroativa ? saoPauloInstant(date, input.onTime ?? '12:00') : now;

  const month = date.slice(0, 7);
  const timestamp = quando.toISOString();

  const modality = isModality(input.modality) ? input.modality : null;

  const entry: CheckinEntry = {
    at: timestamp,
    date,
    classId: input.classId,
    classTitle: input.classTitle,
    modality,
    source: input.source,
    registeredBy: input.registeredBy,
  };

  /*
   * Trava atômica da aula: se já existe, nada mais acontece.
   *
   * A de hoje morre na virada do dia — depois disso a presença já está no
   * histórico e é de lá que as telas leem. A de uma data passada precisa durar
   * mais: ela é o que impede o professor de lançar a mesma chamada atrasada
   * duas vezes, e isso não pode valer só até meia-noite.
   */
  const ttl = retroativa
    ? 60 * 60 * 24 * 60
    : secondsUntilSaoPauloMidnight(now) + 3600;

  const acquired = await redis.set(
    redisKeys.checkinLock(student.id, date, input.classId),
    JSON.stringify(entry),
    { nx: true, ex: ttl },
  );

  if (acquired === null) {
    return { ok: false, reason: 'ja_registrado' };
  }

  const monthlyTtl = 60 * 60 * 24 * 400;

  const tx = redis.multi();
  tx.zadd(redisKeys.checkins(student.id), {
    score: quando.getTime(),
    member: JSON.stringify(entry),
  });
  tx.zincrby(redisKeys.rankAll(), 1, student.id);
  tx.zincrby(redisKeys.rankMonth(month), 1, student.id);
  tx.zincrby(redisKeys.rankBelt(student.belt), 1, student.id);
  tx.zincrby(redisKeys.rankBeltMonth(student.belt, month), 1, student.id);
  tx.expire(redisKeys.rankMonth(month), monthlyTtl);
  tx.expire(redisKeys.rankBeltMonth(student.belt, month), monthlyTtl);

  // O ranking da modalidade. Presença sem turma resolvida fica de fora.
  if (modality) {
    tx.zincrby(redisKeys.rankModality(modality), 1, student.id);
    tx.zincrby(redisKeys.rankModalityMonth(modality, month), 1, student.id);
    tx.expire(redisKeys.rankModalityMonth(modality, month), monthlyTtl);
  }

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
  /**
   * Modalidade da turma, quando a presença gravada não a tem.
   *
   * As presenças anteriores ao campo entram nos rankings por modalidade pela
   * reconstrução, que as classifica pelo `classId`. Sem este parâmetro,
   * desfazer uma delas tiraria o ponto do ranking geral e deixaria o da
   * modalidade intacto — a conta ficaria errada para sempre, e justamente nos
   * registros mais antigos, que são os que mais pesam no acumulado.
   */
  fallbackModality?: ModalityId | null,
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

  /*
   * De qual ranking de modalidade sai o ponto.
   *
   * Sai da **presença gravada**, e não da grade atual: a turma pode ter
   * mudado de modalidade, ou nem existir mais — a avulsa de sábado é apagada
   * depois do treino. Ler a grade aqui faria o ponto ser descontado do
   * ranking errado, e aí a conta nunca mais fecharia.
   *
   * Presença antiga, gravada antes do campo existir, não tem modalidade: ela
   * também não somou em ranking nenhum, então não há o que descontar. É o
   * mesmo motivo pelo qual a reconstrução existe.
   */
  const modalidade =
    target?.modality ?? (isModality(fallbackModality) ? fallbackModality : null);
  if (modalidade) {
    tx.zincrby(redisKeys.rankModality(modalidade), -1, student.id);
    tx.zincrby(redisKeys.rankModalityMonth(modalidade, month), -1, student.id);
  }

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
  return readCheckinsInRange(userIds, saoPauloDayRange(now));
}

/**
 * As presenças de uma data civil, por aluno.
 *
 * Mesma leitura de {@link getTodayCheckins} com o dia escolhido à mão — é o
 * que permite ao professor abrir a chamada de ontem.
 */
export async function getCheckinsOn(
  userIds: readonly string[],
  civilDate: string,
): Promise<Map<string, CheckinEntry[]>> {
  return readCheckinsInRange(userIds, saoPauloDayRangeOf(civilDate));
}

async function readCheckinsInRange(
  userIds: readonly string[],
  range: { readonly start: number; readonly end: number },
): Promise<Map<string, CheckinEntry[]>> {
  const redis = getRedis();
  const present = new Map<string, CheckinEntry[]>();
  if (!redis || userIds.length === 0) return present;

  const { start, end } = range;

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

/**
 * A chave do recorte pedido.
 *
 * Uma função só, usada pela lista e pela posição do aluno: elas já tiveram a
 * escolha de chave escrita duas vezes, e divergir aqui significaria o aluno
 * ler "7º lugar" acima de uma lista em que ele não está.
 *
 * `modality` e `belt` não se combinam — não há chave para "faixa azul no
 * MMA", e inventá-la multiplicaria os zsets por nada. A modalidade ganha,
 * porque é o recorte que a tela do aluno usa.
 */
function rankingKey(options: {
  readonly month?: string;
  readonly belt?: string;
  readonly modality?: string;
}): string {
  const { month, belt, modality } = options;

  if (modality) {
    return month ? redisKeys.rankModalityMonth(modality, month) : redisKeys.rankModality(modality);
  }
  if (belt) {
    return month ? redisKeys.rankBeltMonth(belt, month) : redisKeys.rankBelt(belt);
  }
  return month ? redisKeys.rankMonth(month) : redisKeys.rankAll();
}

/** Ranking geral ou mensal, com recorte opcional por modalidade ou faixa. */
export async function getRanking(
  options: {
    readonly month?: string;
    readonly belt?: string;
    readonly modality?: string;
    readonly limit?: number;
  },
): Promise<RankingRow[]> {
  const redis = getRedis();
  if (!redis) return [];

  const { limit = 20 } = options;
  const key = rankingKey(options);

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

/**
 * Recalcula os rankings por modalidade a partir do histórico.
 *
 * Existe porque a modalidade passou a ser gravada na presença só agora: tudo
 * o que foi marcado antes disso não somou em ranking de modalidade nenhum, e
 * sem esta varredura as listas novas nasceriam vazias — o que o aluno leria
 * como "o ranking zerou", não como "o recorte é novo".
 *
 * A classificação vem de duas fontes, nesta ordem: a modalidade gravada na
 * presença, quando existe, e o `classId` casado contra a grade atual. A
 * segunda é aproximação — uma turma que mudou de modalidade reclassifica o
 * passado inteiro —, mas é a única informação que sobrou, e o acumulado
 * aproximado vale mais que o zerado.
 *
 * Presenças sem turma resolvida ficam de fora, e é o certo: elas contam no
 * ranking geral e não há como saber de qual modalidade são.
 *
 * **Reescreve as chaves do zero.** Rodando durante um check-in, aquele ponto
 * pode se perder — a varredura leu o histórico antes de ele entrar. É uma
 * operação de manutenção, feita uma vez e fora do horário de aula; rodar de
 * novo conserta.
 */
export async function rebuildModalityRankings(
  students: readonly { readonly id: string }[],
  modalityOf: (classId: string) => ModalityId | null,
): Promise<{ readonly presencas: number; readonly semModalidade: number }> {
  const redis = getRedis();
  if (!redis) return { presencas: 0, semModalidade: 0 };

  /** `modalidade` → `mês ou 'geral'` → aluno → pontos. */
  const totais = new Map<ModalityId, Map<string, Map<string, number>>>();

  let presencas = 0;
  let semModalidade = 0;

  const somar = (modality: ModalityId, bucket: string, userId: string): void => {
    const porBucket = totais.get(modality) ?? new Map<string, Map<string, number>>();
    const porAluno = porBucket.get(bucket) ?? new Map<string, number>();
    porAluno.set(userId, (porAluno.get(userId) ?? 0) + 1);
    porBucket.set(bucket, porAluno);
    totais.set(modality, porBucket);
  };

  for (const student of students) {
    // Teto alto: é a vida inteira do aluno na academia, e esta rotina roda
    // uma vez.
    const entries = await listCheckins(student.id, 2000);

    for (const entry of entries) {
      presencas += 1;

      const modality =
        entry.modality ?? (entry.classId ? modalityOf(entry.classId) : null);

      if (!modality) {
        semModalidade += 1;
        continue;
      }

      somar(modality, 'geral', student.id);
      somar(modality, entry.date.slice(0, 7), student.id);
    }
  }

  const monthlyTtl = 60 * 60 * 24 * 400;

  for (const modality of MODALITY_IDS) {
    const porBucket = totais.get(modality) ?? new Map<string, Map<string, number>>();

    // Os meses que existiam e sumiram da conta também precisam ser zerados;
    // como não dá para enumerá-los, a varredura apaga o que vai reescrever e
    // deixa os demais expirarem pelo TTL.
    const geral = porBucket.get('geral') ?? new Map<string, number>();

    const tx = redis.multi();
    tx.del(redisKeys.rankModality(modality));

    for (const [userId, score] of geral) {
      tx.zadd(redisKeys.rankModality(modality), { score, member: userId });
    }

    for (const [bucket, porAluno] of porBucket) {
      if (bucket === 'geral') continue;

      const key = redisKeys.rankModalityMonth(modality, bucket);
      tx.del(key);
      for (const [userId, score] of porAluno) {
        tx.zadd(key, { score, member: userId });
      }
      tx.expire(key, monthlyTtl);
    }

    await tx.exec();
  }

  return { presencas, semModalidade };
}

/** Posição do aluno no recorte, ou `null` se ele ainda não pontuou. */
export async function getRankingPosition(
  userId: string,
  options: {
    readonly month?: string;
    readonly belt?: string;
    readonly modality?: string;
  } = {},
): Promise<{ position: number; score: number } | null> {
  const redis = getRedis();
  if (!redis) return null;

  const key = rankingKey(options);

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
    // Presença gravada antes do campo existir volta sem modalidade, que é o
    // que a reconstrução conserta.
    modality: isModality(row['modality']) ? row['modality'] : null,
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
