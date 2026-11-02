import 'server-only';

import { getRedis, redisKeys } from '@/lib/redis';
import { asString, isRecord } from '@/lib/repositories/parse';
import { addDays, saoPauloDateString } from '@/utils/datetime';

/**
 * Aulas personalizadas (`schedule:overrides`).
 *
 * Uma aula personalizada é **a mesma turma da grade, em outro horário, numa
 * data só**: "hoje o MMA é 18:30 em vez de 19:30". No dia marcado, a turma
 * deixa de acontecer no horário normal e passa a acontecer no personalizado —
 * e é nesse horário que o QR da academia libera o check-in.
 *
 * Duas decisões sustentam o resto:
 *
 *  1. **A grade nunca é escrita.** `schedule:classes` continua intocada, então
 *     o horário normal volta sozinho no dia seguinte e a landing page segue
 *     anunciando a grade de verdade. Era o pedido literal: vale só hoje, não
 *     altera o horário normal.
 *
 *  2. **O `classId` é o da turma.** A presença é gravada com ele
 *     ({@link import('@/types/domain').CheckinEntry}), e ranking, relatório,
 *     diário de aula e a matrícula do aluno (`student.classIds`) todos buscam
 *     a turma por esse id. Mantendo o id, a presença da aula personalizada
 *     entra no ranking e no relatório sem nenhum tratamento especial — ela é
 *     presença naquela turma, como qualquer outra.
 *
 * Por isso também não existe "aula personalizada do zero": sem uma turma da
 * grade por trás não haveria matrícula para conferir, e o check-in ficaria
 * aberto para a academia inteira.
 */

export interface ClassOverride {
  /** `ov-<classId>-<date>`: uma turma tem no máximo um horário por data. */
  readonly id: string;
  /** Turma da grade que muda de horário. */
  readonly classId: string;
  /** `YYYY-MM-DD` — dia civil em São Paulo. */
  readonly date: string;
  /** `HH:mm` no fuso de São Paulo. */
  readonly startTime: string;
  readonly endTime: string;
  /** Recado opcional do professor, mostrado ao aluno. */
  readonly note: string;
  readonly createdAt: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_OVERRIDES = 200;
const MAX_NOTE = 140;

/**
 * Por quantos dias uma exceção vencida continua gravada.
 *
 * Só serve para o professor conferir o que fez na semana — o motor ignora
 * data passada. Sem a poda, a chave cresceria para sempre.
 */
const KEEP_PAST_DAYS = 7;

function parseOverride(value: unknown): ClassOverride | null {
  if (!isRecord(value)) return null;

  const id = asString(value['id']);
  const classId = asString(value['classId']);
  const date = asString(value['date']);
  const startTime = asString(value['startTime']);
  const endTime = asString(value['endTime']);

  if (id.length === 0 || classId.length === 0) return null;
  if (!DATE_PATTERN.test(date)) return null;
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) return null;
  if (endTime <= startTime) return null;

  return {
    id,
    classId,
    date,
    startTime,
    endTime,
    note: asString(value['note']).slice(0, MAX_NOTE),
    createdAt: asString(value['createdAt']),
  };
}

/** Id estável por turma e data: salvar de novo substitui, nunca duplica. */
export function overrideId(classId: string, date: string): string {
  return `ov-${classId}-${date}`;
}

/** Todas as exceções gravadas, da mais próxima para a mais distante. */
export async function listClassOverrides(): Promise<ClassOverride[]> {
  const redis = getRedis();
  if (!redis) return [];

  try {
    const raw = await redis.get<unknown>(redisKeys.scheduleOverrides());
    const list = Array.isArray(raw) ? raw : isRecord(raw) ? raw['overrides'] : null;
    if (!Array.isArray(list)) return [];

    const overrides: ClassOverride[] = [];
    for (const item of list) {
      const parsed = parseOverride(item);
      if (parsed) overrides.push(parsed);
    }

    return overrides.sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.startTime.localeCompare(b.startTime),
    );
  } catch (error) {
    // Mesma regra da grade: uma exceção ilegível não pode derrubar o check-in
    // da academia. Sem exceção, todo mundo cai no horário normal.
    console.error('[classOverrides] falha ao ler schedule:overrides', error);
    return [];
  }
}

/** Exceções que ainda valem: a de hoje e as programadas para frente. */
export async function listUpcomingClassOverrides(now: Date): Promise<ClassOverride[]> {
  const today = saoPauloDateString(now);
  const all = await listClassOverrides();
  return all.filter((item) => item.date >= today);
}

async function persist(overrides: readonly ClassOverride[], now: Date): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  const floor = addDays(saoPauloDateString(now), -KEEP_PAST_DAYS);
  const kept = overrides.filter((item) => item.date >= floor).slice(0, MAX_OVERRIDES);

  await redis.set(
    redisKeys.scheduleOverrides(),
    JSON.stringify({ overrides: kept, updatedAt: now.toISOString() }),
  );
}

export interface ClassOverrideInput {
  readonly classId: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly note: string;
}

export type ClassOverrideValidation =
  | { readonly ok: true; readonly override: ClassOverride }
  | { readonly ok: false; readonly error: string };

export function validateClassOverride(
  input: ClassOverrideInput,
  now: Date,
): ClassOverrideValidation {
  const classId = input.classId.trim();
  if (classId.length === 0) {
    return { ok: false, error: 'Escolha a turma que vai mudar de horário.' };
  }

  if (!DATE_PATTERN.test(input.date)) {
    return { ok: false, error: 'Escolha o dia da aula personalizada.' };
  }

  // Data passada não é recusada por capricho: o motor ignora, então o
  // professor salvaria uma exceção que nunca vale e nada aconteceria.
  if (input.date < saoPauloDateString(now)) {
    return { ok: false, error: 'Essa data já passou. Escolha hoje ou um dia à frente.' };
  }

  if (!TIME_PATTERN.test(input.startTime) || !TIME_PATTERN.test(input.endTime)) {
    return { ok: false, error: 'Horário inválido. Use o formato HH:mm.' };
  }

  if (input.endTime <= input.startTime) {
    return { ok: false, error: 'O fim da aula precisa ser depois do início.' };
  }

  return {
    ok: true,
    override: {
      id: overrideId(classId, input.date),
      classId,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      note: input.note.trim().slice(0, MAX_NOTE),
      createdAt: now.toISOString(),
    },
  };
}

export async function upsertClassOverride(
  input: ClassOverrideInput,
  now: Date,
): Promise<ClassOverrideValidation> {
  const validation = validateClassOverride(input, now);
  if (!validation.ok) return validation;

  const current = await listClassOverrides();
  const index = current.findIndex((item) => item.id === validation.override.id);

  const next =
    index >= 0
      ? current.map((item) => (item.id === validation.override.id ? validation.override : item))
      : [...current, validation.override];

  await persist(next, now);
  return validation;
}

/** Remove a exceção: a turma volta ao horário normal naquele dia. */
export async function removeClassOverride(id: string, now: Date): Promise<void> {
  const current = await listClassOverrides();
  await persist(
    current.filter((item) => item.id !== id),
    now,
  );
}
