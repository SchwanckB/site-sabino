import 'server-only';

import { getRedis, redisKeys } from '@/lib/redis';
import { asString, isRecord } from '@/lib/repositories/parse';

/**
 * Eventos avulsos do calendário (`calendar:events`).
 *
 * Aulas recorrentes vêm da grade e graduações previstas vêm do motor — nada
 * disso é gravado aqui. Esta chave guarda só o que o professor marca à mão:
 * feriado, confraternização, seminário, exame de faixa.
 */

export const EVENT_KINDS = ['evento', 'feriado', 'graduacao', 'aviso'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_KIND_LABELS: Readonly<Record<EventKind, string>> = {
  evento: 'Evento',
  feriado: 'Feriado',
  graduacao: 'Exame de faixa',
  aviso: 'Aviso',
};

export interface CalendarEvent {
  readonly id: string;
  /** `YYYY-MM-DD` — dia civil em São Paulo. */
  readonly date: string;
  readonly title: string;
  readonly kind: EventKind;
  /** `HH:mm` opcional; vazio significa o dia todo. */
  readonly time: string;
  readonly note: string;
  /** Fecha a academia no dia (feriado) — a grade some do calendário. */
  readonly closesAcademy: boolean;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_EVENTS = 400;

function parseEvent(value: unknown): CalendarEvent | null {
  if (!isRecord(value)) return null;

  const id = asString(value['id']);
  const date = asString(value['date']);
  const title = asString(value['title']);

  if (id.length === 0 || !DATE_PATTERN.test(date) || title.length === 0) return null;

  const kind = asString(value['kind'], 'evento');
  const time = asString(value['time']);

  return {
    id,
    date,
    title,
    kind: (EVENT_KINDS as readonly string[]).includes(kind) ? (kind as EventKind) : 'evento',
    time: TIME_PATTERN.test(time) ? time : '',
    note: asString(value['note']),
    closesAcademy: value['closesAcademy'] === true || value['closesAcademy'] === 'true',
  };
}

export async function listEvents(): Promise<CalendarEvent[]> {
  const redis = getRedis();
  if (!redis) return [];

  try {
    const raw = await redis.get<unknown>(redisKeys.calendarEvents());
    const list = Array.isArray(raw) ? raw : isRecord(raw) ? raw['events'] : null;
    if (!Array.isArray(list)) return [];

    const events: CalendarEvent[] = [];
    for (const item of list) {
      const event = parseEvent(item);
      if (event) events.push(event);
    }

    return events.sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.time.localeCompare(b.time),
    );
  } catch (error) {
    console.error('[calendar] falha ao ler calendar:events', error);
    return [];
  }
}

async function persist(events: readonly CalendarEvent[], now: Date): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  await redis.set(
    redisKeys.calendarEvents(),
    JSON.stringify({ events: events.slice(0, MAX_EVENTS), updatedAt: now.toISOString() }),
  );
}

export interface EventInput {
  readonly id?: string;
  readonly date: string;
  readonly title: string;
  readonly kind: string;
  readonly time: string;
  readonly note: string;
  readonly closesAcademy: boolean;
}

export type EventValidation =
  | { readonly ok: true; readonly event: CalendarEvent }
  | { readonly ok: false; readonly error: string };

export function validateEvent(input: EventInput): EventValidation {
  const title = input.title.trim();
  if (title.length < 2) {
    return { ok: false, error: 'Dê um nome ao evento.' };
  }
  if (!DATE_PATTERN.test(input.date)) {
    return { ok: false, error: 'Escolha a data do evento.' };
  }

  const time = input.time.trim();
  if (time.length > 0 && !TIME_PATTERN.test(time)) {
    return { ok: false, error: 'Horário inválido. Use HH:mm ou deixe em branco.' };
  }

  const kind = (EVENT_KINDS as readonly string[]).includes(input.kind)
    ? (input.kind as EventKind)
    : 'evento';

  return {
    ok: true,
    event: {
      id: input.id && input.id.length > 0 ? input.id : `ev-${Date.now().toString(36)}`,
      date: input.date,
      title,
      kind,
      time,
      note: input.note.trim(),
      closesAcademy: input.closesAcademy,
    },
  };
}

export async function upsertEvent(input: EventInput, now: Date): Promise<EventValidation> {
  const validation = validateEvent(input);
  if (!validation.ok) return validation;

  const current = await listEvents();
  const index = current.findIndex((item) => item.id === validation.event.id);

  const next =
    index >= 0
      ? current.map((item) => (item.id === validation.event.id ? validation.event : item))
      : [...current, validation.event];

  await persist(next, now);
  return validation;
}

export async function removeEvent(eventId: string, now: Date): Promise<void> {
  const current = await listEvents();
  await persist(
    current.filter((item) => item.id !== eventId),
    now,
  );
}
