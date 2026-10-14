import 'server-only';

import { seedSchedule, type ClassSlot, type ModalityId, type Weekday } from '@/data/seed';
import { getRedis, redisKeys } from '@/lib/redis';
import { getScheduleFresh, sortClasses } from '@/lib/schedule';

/**
 * Escrita da grade de horários (`schedule:classes`).
 *
 * A landing page lê esta mesma chave. Por isso a gravação sempre valida e
 * ordena antes de persistir: um registro torto aqui apareceria no site público.
 */

const MODALITIES: readonly ModalityId[] = ['jiu-jitsu', 'mma', 'kids'];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface ClassInput {
  readonly id?: string;
  readonly weekday: number;
  readonly startTime: string;
  readonly endTime: string;
  readonly title: string;
  readonly modality: string;
  readonly level: string;
}

export type ClassValidation =
  | { readonly ok: true; readonly slot: ClassSlot }
  | { readonly ok: false; readonly error: string };

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
}

export function validateClass(input: ClassInput): ClassValidation {
  const title = input.title.trim();
  if (title.length < 2) {
    return { ok: false, error: 'Informe o nome da turma.' };
  }

  if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6) {
    return { ok: false, error: 'Dia da semana inválido.' };
  }

  if (!TIME_PATTERN.test(input.startTime) || !TIME_PATTERN.test(input.endTime)) {
    return { ok: false, error: 'Horário inválido. Use o formato HH:mm.' };
  }

  if (input.endTime <= input.startTime) {
    return { ok: false, error: 'O fim da aula precisa ser depois do início.' };
  }

  if (!(MODALITIES as readonly string[]).includes(input.modality)) {
    return { ok: false, error: 'Modalidade inválida.' };
  }

  const weekday = input.weekday as Weekday;
  const id =
    input.id && input.id.length > 0
      ? input.id
      : `${weekday}-${input.startTime.replace(':', '')}-${slugify(title)}`;

  return {
    ok: true,
    slot: {
      id,
      weekday,
      startTime: input.startTime,
      endTime: input.endTime,
      title,
      modality: input.modality as ModalityId,
      level: input.level.trim(),
    },
  };
}

async function persist(classes: readonly ClassSlot[], now: Date): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  await redis.set(
    redisKeys.scheduleClasses(),
    JSON.stringify({
      classes: sortClasses(classes),
      updatedAt: now.toISOString(),
    }),
  );
}

/** Grade atual para edição. Sem nada no Redis, parte da grade real do seed. */
export async function getEditableSchedule(): Promise<ClassSlot[]> {
  const schedule = await getScheduleFresh();
  return sortClasses(schedule.classes);
}

export async function upsertClass(input: ClassInput, now: Date): Promise<ClassValidation> {
  const validation = validateClass(input);
  if (!validation.ok) return validation;

  const current = await getEditableSchedule();
  const index = current.findIndex((item) => item.id === validation.slot.id);

  const next = index >= 0
    ? current.map((item) => (item.id === validation.slot.id ? validation.slot : item))
    : [...current, validation.slot];

  await persist(next, now);
  return validation;
}

export async function removeClass(classId: string, now: Date): Promise<void> {
  const current = await getEditableSchedule();
  await persist(
    current.filter((item) => item.id !== classId),
    now,
  );
}

/** Restaura a grade confirmada pela academia, em `data/seed.ts`. */
export async function resetScheduleToSeed(now: Date): Promise<void> {
  await persist(seedSchedule.classes, now);
}
