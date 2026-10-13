import { seedSchedule, type ClassSlot, type ModalityId, type Schedule, type Weekday } from '@/data/seed';
import { getRedis, redisKeys } from '@/lib/redis';

/**
 * Leitura da grade de horarios para a landing page.
 *
 * Tenta o Redis (`schedule:classes`, mantido pelo painel do Admin) e cai para
 * o seed quando a chave nao existe, o formato nao bate ou o Redis esta fora.
 * A landing page nunca deve quebrar por causa da grade.
 */

const MODALITIES: readonly ModalityId[] = ['jiu-jitsu', 'mma', 'kids'];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWeekday(value: unknown): value is Weekday {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;
}

function isModalityId(value: unknown): value is ModalityId {
  return typeof value === 'string' && (MODALITIES as readonly string[]).includes(value);
}

function isTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

/**
 * Valida um registro vindo do Redis. Dado externo nunca entra na UI sem
 * passar por aqui - um campo errado descarta so aquela aula.
 */
function parseClassSlot(value: unknown): ClassSlot | null {
  if (!isRecord(value)) return null;

  const { id, weekday, startTime, endTime, title, modality, level } = value;

  if (typeof id !== 'string' || id.length === 0) return null;
  if (!isWeekday(weekday)) return null;
  if (!isTime(startTime) || !isTime(endTime)) return null;
  if (typeof title !== 'string' || title.length === 0) return null;
  if (!isModalityId(modality)) return null;
  if (typeof level !== 'string') return null;

  return { id, weekday, startTime, endTime, title, modality, level };
}

interface StoredSchedule {
  readonly classes: readonly ClassSlot[];
  readonly updatedAt: string | null;
}

function parseStoredSchedule(raw: unknown): StoredSchedule | null {
  // O Admin pode gravar tanto o array puro quanto { classes, updatedAt }.
  const source = Array.isArray(raw) ? { classes: raw, updatedAt: null } : raw;
  if (!isRecord(source)) return null;

  const { classes, updatedAt } = source;
  if (!Array.isArray(classes)) return null;

  const parsed: ClassSlot[] = [];
  for (const entry of classes) {
    const slot = parseClassSlot(entry);
    if (slot !== null) {
      parsed.push(slot);
    }
  }

  if (parsed.length === 0) return null;

  return {
    classes: parsed,
    updatedAt: typeof updatedAt === 'string' ? updatedAt : null,
  };
}

/** Ordena por dia da semana e, dentro do dia, por horario de inicio. */
export function sortClasses(classes: readonly ClassSlot[]): ClassSlot[] {
  return [...classes].sort((a, b) =>
    a.weekday !== b.weekday
      ? a.weekday - b.weekday
      : a.startTime.localeCompare(b.startTime),
  );
}

/** Agrupa a grade por dia da semana, mantendo apenas os dias com aula. */
export function groupByWeekday(
  classes: readonly ClassSlot[],
): { weekday: Weekday; classes: ClassSlot[] }[] {
  const byDay = new Map<Weekday, ClassSlot[]>();

  for (const slot of sortClasses(classes)) {
    const current = byDay.get(slot.weekday);
    if (current) {
      current.push(slot);
    } else {
      byDay.set(slot.weekday, [slot]);
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([weekday, daySlots]) => ({ weekday, classes: daySlots }));
}

/**
 * Grade de horarios para a landing page.
 * Sempre resolve: Redis quando disponivel, seed caso contrario.
 */
export async function getSchedule(): Promise<Schedule> {
  const redis = getRedis();
  if (!redis) {
    return seedSchedule;
  }

  try {
    const raw = await redis.get<unknown>(redisKeys.scheduleClasses());
    const stored = parseStoredSchedule(raw);

    if (!stored) {
      return seedSchedule;
    }

    return {
      classes: sortClasses(stored.classes),
      isExample: false,
      updatedAt: stored.updatedAt,
    };
  } catch (error) {
    console.error('[schedule] falha ao ler schedule:classes, usando o seed', error);
    return seedSchedule;
  }
}
