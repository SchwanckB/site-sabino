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

  /*
   * Os rankings que o aluno vê: por academia, e por academia + modalidade.
   *
   * A unidade vem da **ficha**, não da aula. Quem é de Terra de Areia e
   * treinou uma noite em Três Cachoeiras pontua no ranking de Terra de Areia,
   * que é a academia dele — a visita não o insere no pódio da outra.
   */
  tx.zincrby(redisKeys.rankUnit(student.unit), 1, student.id);
  tx.zincrby(redisKeys.rankUnitMonth(student.unit, month), 1, student.id);
  tx.expire(redisKeys.rankUnitMonth(student.unit, month), monthlyTtl);

  // O ranking feminino acompanha o da academia: toda presença dela conta,
  // seja na turma feminina ou na mista. Ver `lib/redis.ts`.
  if (student.gender === 'feminino') {
    tx.zincrby(redisKeys.rankUnitFeminino(student.unit), 1, student.id);
    tx.zincrby(redisKeys.rankUnitFemininoMonth(student.unit, month), 1, student.id);
    tx.expire(redisKeys.rankUnitFemininoMonth(student.unit, month), monthlyTtl);
  }

  // Presença sem turma resolvida não tem modalidade: conta nas duas listas
  // acima e em nenhuma por modalidade.
  if (modality) {
    tx.zincrby(redisKeys.rankUnitModality(student.unit, modality), 1, student.id);
    tx.zincrby(redisKeys.rankUnitModalityMonth(student.unit, modality, month), 1, student.id);
    tx.expire(redisKeys.rankUnitModalityMonth(student.unit, modality, month), monthlyTtl);
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
  tx.zincrby(redisKeys.rankUnit(student.unit), -1, student.id);
  tx.zincrby(redisKeys.rankUnitMonth(student.unit, month), -1, student.id);

  if (student.gender === 'feminino') {
    tx.zincrby(redisKeys.rankUnitFeminino(student.unit), -1, student.id);
    tx.zincrby(redisKeys.rankUnitFemininoMonth(student.unit, month), -1, student.id);
  }

  const modalidade =
    target?.modality ?? (isModality(fallbackModality) ? fallbackModality : null);
  if (modalidade) {
    tx.zincrby(redisKeys.rankUnitModality(student.unit, modalidade), -1, student.id);
    tx.zincrby(
      redisKeys.rankUnitModalityMonth(student.unit, modalidade, month),
      -1,
      student.id,
    );
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
  readonly unit?: string;
  readonly feminino?: boolean;
}): string {
  const { month, belt, modality, unit, feminino } = options;

  /*
   * Modalidade sem academia não existe.
   *
   * As chaves por modalidade são todas por unidade — não há "o ranking de
   * MMA da rede". Antes este caso caía no `return` lá embaixo e devolvia o
   * ranking **geral**: a tela pedia o pódio do jiu e recebia o de tudo, sem
   * erro nenhum, com os números errados parecendo certos. Falhar aqui é a
   * única resposta honesta, e só um erro de programação chega neste ponto.
   */
  if (modality && !unit) {
    throw new Error('getRanking: recorte por modalidade exige a academia');
  }
  if (feminino && !unit) {
    throw new Error('getRanking: o ranking feminino exige a academia');
  }

  // Feminino é um recorte das alunas, não um corte dentro de uma modalidade:
  // ele soma tudo o que elas treinam naquela academia.
  if (feminino && unit) {
    return month ? redisKeys.rankUnitFemininoMonth(unit, month) : redisKeys.rankUnitFeminino(unit);
  }

  /*
   * A academia manda, quando vem.
   *
   * É o recorte de toda tela que o aluno abre: ele disputa com os colegas da
   * academia dele. Sem `unit` sobram as chaves da rede inteira, que é o que
   * a graduação e a limpeza de ficha usam.
   */
  if (unit) {
    if (modality) {
      return month
        ? redisKeys.rankUnitModalityMonth(unit, modality, month)
        : redisKeys.rankUnitModality(unit, modality);
    }
    return month ? redisKeys.rankUnitMonth(unit, month) : redisKeys.rankUnit(unit);
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
    /** Academia do aluno. Sem ela o recorte é a rede inteira. */
    readonly unit?: string;
    /** Só as alunas daquela academia, em todas as modalidades. */
    readonly feminino?: boolean;
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
 * Recalcula os rankings do aluno a partir do histórico.
 *
 * Reescreve as quatro famílias de chave que a tela do aluno lê: o ranking da
 * academia e o de cada modalidade dentro dela, no acumulado e mês a mês.
 *
 * Existe porque os dois recortes nasceram depois das presenças. A modalidade
 * só passou a ser gravada em cada check-in agora, e a separação por academia
 * veio junto — sem esta varredura as listas nasceriam vazias, o que o aluno
 * leria como "o ranking zerou", não como "o recorte é novo".
 *
 * A modalidade de cada presença vem de duas fontes, nesta ordem: a gravada na
 * presença, quando existe, e o `classId` casado contra a grade atual. A
 * segunda é aproximação — uma turma que mudou de modalidade reclassifica o
 * passado inteiro —, mas é a única informação que sobrou, e o acumulado
 * aproximado vale mais que o zerado.
 *
 * A academia vem da ficha de hoje. Quem mudou de unidade tem o histórico
 * inteiro movido para a nova, e é o comportamento desejado: ele disputa com
 * os colegas de onde treina agora.
 *
 * Presença sem turma resolvida conta no ranking da academia e em nenhum por
 * modalidade — não há como saber de qual ela é, e um ponto na lista errada é
 * pior que um ponto a menos.
 *
 * **Reescreve as chaves do zero.** Rodando durante um check-in, aquele ponto
 * pode se perder — a varredura leu o histórico antes de ele entrar. É uma
 * operação de manutenção, feita fora do horário de aula; rodar de novo
 * conserta.
 */
export async function rebuildModalityRankings(
  students: readonly {
    readonly id: string;
    readonly unit: string;
    readonly gender: string;
  }[],
  modalityOf: (classId: string) => ModalityId | null,
): Promise<{ readonly presencas: number; readonly semModalidade: number }> {
  const redis = getRedis();
  if (!redis) return { presencas: 0, semModalidade: 0 };

  /**
   * Contagem por chave do Redis.
   *
   * Um mapa plano, com a chave final como índice, em vez de um mapa aninhado
   * por unidade, modalidade e mês: com dois recortes cruzados o aninhamento
   * vira três níveis de `Map` e a leitura do código passa a custar mais que a
   * conta que ele faz.
   */
  const porChave = new Map<string, Map<string, number>>();
  /** As chaves mensais, que precisam de TTL. */
  const mensais = new Set<string>();

  const somar = (key: string, userId: string): void => {
    const atual = porChave.get(key) ?? new Map<string, number>();
    atual.set(userId, (atual.get(userId) ?? 0) + 1);
    porChave.set(key, atual);
  };

  let presencas = 0;
  let semModalidade = 0;

  /*
   * Toda chave que possa existir entra na lista a ser apagada, mesmo sem
   * ninguém a pontuar.
   *
   * Sem isso, a modalidade que ficou sem nenhuma presença manteria a lista
   * antiga: a varredura só apagaria o que fosse reescrever, e o recálculo
   * deixaria no ar justamente o ranking que deveria ter esvaziado.
   */
  const unidades = [...new Set(students.map((student) => student.unit))];
  const aLimpar = new Set<string>();
  for (const unit of unidades) {
    aLimpar.add(redisKeys.rankUnit(unit));
    aLimpar.add(redisKeys.rankUnitFeminino(unit));
    for (const modality of MODALITY_IDS) {
      aLimpar.add(redisKeys.rankUnitModality(unit, modality));
    }
  }

  for (const student of students) {
    // Teto alto: é a vida inteira do aluno na academia, e esta rotina roda
    // de vez em quando.
    const entries = await listCheckins(student.id, 2000);

    for (const entry of entries) {
      presencas += 1;

      const month = entry.date.slice(0, 7);
      const mesDaUnidade = redisKeys.rankUnitMonth(student.unit, month);

      somar(redisKeys.rankUnit(student.unit), student.id);
      somar(mesDaUnidade, student.id);
      mensais.add(mesDaUnidade);
      aLimpar.add(mesDaUnidade);

      if (student.gender === 'feminino') {
        const mesFeminino = redisKeys.rankUnitFemininoMonth(student.unit, month);
        somar(redisKeys.rankUnitFeminino(student.unit), student.id);
        somar(mesFeminino, student.id);
        mensais.add(mesFeminino);
        aLimpar.add(mesFeminino);
      }

      const modality = entry.modality ?? (entry.classId ? modalityOf(entry.classId) : null);

      if (!modality) {
        semModalidade += 1;
        continue;
      }

      const mesDaModalidade = redisKeys.rankUnitModalityMonth(student.unit, modality, month);

      somar(redisKeys.rankUnitModality(student.unit, modality), student.id);
      somar(mesDaModalidade, student.id);
      mensais.add(mesDaModalidade);
      aLimpar.add(mesDaModalidade);
    }
  }

  const monthlyTtl = 60 * 60 * 24 * 400;

  const tx = redis.multi();
  for (const key of aLimpar) tx.del(key);

  for (const [key, porAluno] of porChave) {
    for (const [userId, score] of porAluno) {
      tx.zadd(key, { score, member: userId });
    }
    if (mensais.has(key)) tx.expire(key, monthlyTtl);
  }

  await tx.exec();

  return { presencas, semModalidade };
}

/** Posição do aluno no recorte, ou `null` se ele ainda não pontuou. */
export async function getRankingPosition(
  userId: string,
  options: {
    readonly month?: string;
    readonly belt?: string;
    readonly modality?: string;
    readonly unit?: string;
    readonly feminino?: boolean;
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
