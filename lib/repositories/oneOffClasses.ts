import 'server-only';

import { MODALITY_IDS, type ClassSlot, type ModalityId } from '@/data/seed';
import { getRedis, redisKeys } from '@/lib/redis';
import { asString, isRecord } from '@/lib/repositories/parse';
import { toUnitId, type UnitId } from '@/types/domain';
import { addDays, saoPauloDateString } from '@/utils/datetime';

/**
 * Turmas avulsas (`schedule:oneoff`).
 *
 * Uma turma que **não existe na grade** e acontece num dia só: o treino de
 * sábado de manhã que a academia resolveu abrir nesta semana, o seminário, o
 * treino extra antes do campeonato.
 *
 * É o oposto da aula personalizada de `classOverrides`. Lá, a turma existe na
 * grade e muda de horário num dia — e o check-in continua restrito a quem tem
 * aquela turma na ficha. Aqui não há turma na grade, logo não há matrícula
 * para conferir: a aula é **aberta a todo aluno ativo da unidade**. Era o
 * pedido literal — "quem for marca presença sem precisar pôr na ficha de
 * cada um".
 *
 * Três decisões sustentam o resto:
 *
 *  1. **A grade nunca é escrita.** Como nas exceções, `schedule:classes`
 *     continua intocada: a landing page anuncia a grade de verdade e o
 *     sábado avulso não vira horário fixo por engano.
 *
 *  2. **Ela entra na grade efetiva como um `ClassSlot` comum**, com
 *     `onlyOnDate` na data e `openToAll`. Assim o motor de presença, a
 *     chamada, o ranking e o relatório funcionam sem tratamento especial — o
 *     que muda é só quem pode marcar.
 *
 *  3. **O id carrega a data.** `avulsa-<data>-<hora>` é estável: salvar duas
 *     vezes o mesmo sábado no mesmo horário substitui em vez de duplicar, e
 *     a presença gravada continua apontando para a aula certa.
 */

export interface OneOffClass {
  /** `avulsa-<YYYY-MM-DD>-<HHmm>`. */
  readonly id: string;
  /** `YYYY-MM-DD` — dia civil em São Paulo. */
  readonly date: string;
  /** `HH:mm` no fuso de São Paulo. */
  readonly startTime: string;
  readonly endTime: string;
  readonly title: string;
  readonly modality: ModalityId;
  /** Texto livre: "aberto a todas as faixas", "só graduados". */
  readonly level: string;
  readonly unit: UnitId;
  /** Quem dá a aula. Texto livre e opcional. */
  readonly teacher: string;
  readonly createdAt: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_ONE_OFF = 100;
const MAX_TITLE = 60;
const MAX_LEVEL = 60;
const MAX_TEACHER = 60;

/**
 * Por quantos dias uma turma avulsa vencida continua gravada.
 *
 * Mais longo que o das exceções: a presença daquele sábado aponta para este
 * id, e a chamada retroativa pode ser lançada semanas depois. Some antes
 * disso e a tela mostraria "turma não encontrada" sobre presença que existe.
 */
const KEEP_PAST_DAYS = 90;

export function oneOffId(date: string, startTime: string): string {
  return `avulsa-${date}-${startTime.replace(':', '')}`;
}

/** `true` para o id de uma turma avulsa — útil para separá-la da grade. */
export function isOneOffId(id: string): boolean {
  return id.startsWith('avulsa-');
}

function parseOneOff(value: unknown): OneOffClass | null {
  if (!isRecord(value)) return null;

  const id = asString(value['id']);
  const date = asString(value['date']);
  const startTime = asString(value['startTime']);
  const endTime = asString(value['endTime']);
  const title = asString(value['title']);
  const modality = asString(value['modality']);

  if (id.length === 0 || title.length === 0) return null;
  if (!DATE_PATTERN.test(date)) return null;
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) return null;
  if (endTime <= startTime) return null;

  return {
    id,
    date,
    startTime,
    endTime,
    title: title.slice(0, MAX_TITLE),
    modality: (MODALITY_IDS as readonly string[]).includes(modality)
      ? (modality as ModalityId)
      : 'jiu-jitsu',
    level: asString(value['level']).slice(0, MAX_LEVEL),
    unit: toUnitId(value['unit']),
    teacher: asString(value['teacher']).slice(0, MAX_TEACHER),
    createdAt: asString(value['createdAt']),
  };
}

/** Todas as turmas avulsas gravadas, da mais próxima para a mais distante. */
export async function listOneOffClasses(): Promise<OneOffClass[]> {
  const redis = getRedis();
  if (!redis) return [];

  try {
    const raw = await redis.get<unknown>(redisKeys.scheduleOneOff());
    const list = Array.isArray(raw) ? raw : isRecord(raw) ? raw['classes'] : null;
    if (!Array.isArray(list)) return [];

    const aulas: OneOffClass[] = [];
    for (const item of list) {
      const parsed = parseOneOff(item);
      if (parsed) aulas.push(parsed);
    }

    return aulas.sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.startTime.localeCompare(b.startTime),
    );
  } catch (error) {
    // Mesma regra da grade: um registro ilegível não pode derrubar o check-in
    // da academia inteira. Sem avulsa, só a grade normal vale.
    console.error('[oneOffClasses] falha ao ler schedule:oneoff', error);
    return [];
  }
}

/** As que ainda valem: a de hoje e as programadas para frente. */
export async function listUpcomingOneOffClasses(now: Date): Promise<OneOffClass[]> {
  const today = saoPauloDateString(now);
  const all = await listOneOffClasses();
  return all.filter((item) => item.date >= today);
}

/**
 * Converte para o formato que o motor de presença entende.
 *
 * `onlyOnDate` prende a aula àquela data — ela não se repete na semana
 * seguinte. `openToAll` é o que dispensa a matrícula.
 *
 * `weekday` é derivado da data e existe só para o relatório e o calendário,
 * que agrupam por dia da semana; o motor não o consulta em aula com
 * `onlyOnDate`.
 */
export function toClassSlot(aula: OneOffClass): ClassSlot {
  const [year, month, day] = aula.date.split('-').map(Number);
  const weekday = new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1),
  ).getUTCDay();

  return {
    id: aula.id,
    weekday: weekday as ClassSlot['weekday'],
    startTime: aula.startTime,
    endTime: aula.endTime,
    title: aula.title,
    modality: aula.modality,
    level: aula.level,
    unit: aula.unit,
    onlyOnDate: aula.date,
    openToAll: true,
    ...(aula.teacher.length > 0 ? { teacher: aula.teacher } : {}),
  };
}

async function persist(aulas: readonly OneOffClass[], now: Date): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  const floor = addDays(saoPauloDateString(now), -KEEP_PAST_DAYS);
  const kept = aulas.filter((item) => item.date >= floor).slice(0, MAX_ONE_OFF);

  await redis.set(
    redisKeys.scheduleOneOff(),
    JSON.stringify({ classes: kept, updatedAt: now.toISOString() }),
  );
}

export interface OneOffInput {
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly title: string;
  readonly modality: string;
  readonly level: string;
  readonly unit: string;
  readonly teacher: string;
}

export type OneOffValidation =
  | { readonly ok: true; readonly aula: OneOffClass }
  | { readonly ok: false; readonly error: string };

export function validateOneOff(input: OneOffInput, now: Date): OneOffValidation {
  const title = input.title.trim();
  if (title.length < 2) {
    return { ok: false, error: 'Dê um nome para a aula. Ex.: "Treino de sábado".' };
  }

  if (!DATE_PATTERN.test(input.date)) {
    return { ok: false, error: 'Escolha o dia da aula.' };
  }

  /*
   * Data passada é recusada porque o motor de presença ignora: a aula seria
   * gravada e nunca abriria o check-in. Para lançar a chamada de um treino
   * que já aconteceu existe o seletor de dia em Presença.
   */
  if (input.date < saoPauloDateString(now)) {
    return { ok: false, error: 'Essa data já passou. Escolha hoje ou um dia à frente.' };
  }

  if (!TIME_PATTERN.test(input.startTime) || !TIME_PATTERN.test(input.endTime)) {
    return { ok: false, error: 'Horário inválido. Use o formato HH:mm.' };
  }

  if (input.endTime <= input.startTime) {
    return { ok: false, error: 'O fim da aula precisa ser depois do início.' };
  }

  const modality = input.modality.trim();
  if (!(MODALITY_IDS as readonly string[]).includes(modality)) {
    return { ok: false, error: 'Escolha a modalidade.' };
  }

  return {
    ok: true,
    aula: {
      id: oneOffId(input.date, input.startTime),
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      title: title.slice(0, MAX_TITLE),
      modality: modality as ModalityId,
      level: input.level.trim().slice(0, MAX_LEVEL),
      unit: toUnitId(input.unit),
      teacher: input.teacher.trim().slice(0, MAX_TEACHER),
      createdAt: now.toISOString(),
    },
  };
}

/** Cria ou substitui a turma avulsa daquele dia e horário. */
export async function upsertOneOffClass(
  input: OneOffInput,
  now: Date,
): Promise<OneOffValidation> {
  const validation = validateOneOff(input, now);
  if (!validation.ok) return validation;

  const atual = await listOneOffClasses();
  const semEla = atual.filter((item) => item.id !== validation.aula.id);

  await persist([...semEla, validation.aula], now);
  return validation;
}

export async function removeOneOffClass(id: string, now: Date): Promise<void> {
  const atual = await listOneOffClasses();
  await persist(
    atual.filter((item) => item.id !== id),
    now,
  );
}
