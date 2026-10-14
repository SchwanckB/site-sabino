/**
 * Motor de presença — Sabino Academia.
 *
 * Função pura, sem I/O, recebendo `now: Date` por parâmetro. Responde a duas
 * perguntas:
 *   1. Em qual aula este aluno pode registrar presença agora?
 *   2. Quando é a próxima aula dele?
 *
 * Só entram no cálculo as turmas que o administrador atribuiu ao aluno na
 * aprovação do cadastro.
 */

import { saoPauloMinutesOfDay, saoPauloParts, timeToMinutes } from './datetime';

/** Quanto antes do início a presença já é aceita. */
export const CHECKIN_EARLY_MINUTES = 30;

/** Quanto depois do fim a presença ainda é aceita (aluno atrasado). */
export const CHECKIN_LATE_MINUTES = 15;

const MINUTES_PER_DAY = 24 * 60;
const DAYS_PER_WEEK = 7;

/** Forma mínima de uma aula — compatível com `ClassSlot` de `data/seed.ts`. */
export interface ScheduledClass {
  readonly id: string;
  /** 0 = domingo ... 6 = sábado. */
  readonly weekday: number;
  /** `HH:mm` no fuso de São Paulo. */
  readonly startTime: string;
  readonly endTime: string;
  readonly title: string;
  readonly level: string;
}

export interface OpenClass {
  readonly classId: string;
  readonly title: string;
  readonly level: string;
  readonly startTime: string;
  readonly endTime: string;
  /** Minutos até o início; negativo quando a aula já começou. */
  readonly minutesUntilStart: number;
  /** `true` entre o início e o fim da aula. */
  readonly inProgress: boolean;
}

export interface UpcomingClass {
  readonly classId: string;
  readonly title: string;
  readonly level: string;
  readonly weekday: number;
  readonly startTime: string;
  readonly endTime: string;
  /** Minutos a partir de agora até o início. `0` se já começou. */
  readonly minutesUntilStart: number;
  /** Dias de calendário até a aula: 0 = hoje, 1 = amanhã. */
  readonly daysUntil: number;
}

function assigned(
  classes: readonly ScheduledClass[],
  assignedIds: readonly string[],
): ScheduledClass[] {
  if (assignedIds.length === 0) return [];
  const allowed = new Set(assignedIds);
  return classes.filter((item) => allowed.has(item.id));
}

/**
 * Aulas em que o aluno pode bater presença agora.
 *
 * A janela vai de {@link CHECKIN_EARLY_MINUTES} antes do início até
 * {@link CHECKIN_LATE_MINUTES} depois do fim. Normalmente devolve zero ou uma
 * aula; devolve mais de uma só se a grade tiver turmas sobrepostas.
 */
export function findOpenClasses(
  classes: readonly ScheduledClass[],
  assignedIds: readonly string[],
  now: Date,
): OpenClass[] {
  const { weekday } = saoPauloParts(now);
  const nowMinutes = saoPauloMinutesOfDay(now);

  return assigned(classes, assignedIds)
    .filter((item) => item.weekday === weekday)
    .map((item) => {
      const start = timeToMinutes(item.startTime);
      const end = timeToMinutes(item.endTime);
      return { item, start, end };
    })
    .filter(
      ({ start, end }) =>
        nowMinutes >= start - CHECKIN_EARLY_MINUTES &&
        nowMinutes <= end + CHECKIN_LATE_MINUTES,
    )
    .map(({ item, start, end }) => ({
      classId: item.id,
      title: item.title,
      level: item.level,
      startTime: item.startTime,
      endTime: item.endTime,
      minutesUntilStart: start - nowMinutes,
      inProgress: nowMinutes >= start && nowMinutes <= end,
    }))
    .sort((a, b) => Math.abs(a.minutesUntilStart) - Math.abs(b.minutesUntilStart));
}

/**
 * Próxima aula do aluno a partir de agora, varrendo até sete dias à frente.
 * Uma aula que já começou mas ainda não terminou conta como a próxima.
 */
export function findNextClass(
  classes: readonly ScheduledClass[],
  assignedIds: readonly string[],
  now: Date,
): UpcomingClass | null {
  const mine = assigned(classes, assignedIds);
  if (mine.length === 0) return null;

  const { weekday } = saoPauloParts(now);
  const nowMinutes = saoPauloMinutesOfDay(now);

  let best: UpcomingClass | null = null;
  let bestOffset = Number.POSITIVE_INFINITY;

  for (const item of mine) {
    const start = timeToMinutes(item.startTime);
    const end = timeToMinutes(item.endTime);

    // Dias até a próxima ocorrência deste dia da semana.
    let daysUntil = (item.weekday - weekday + DAYS_PER_WEEK) % DAYS_PER_WEEK;

    // Hoje, mas já terminou: só volta na semana que vem.
    if (daysUntil === 0 && nowMinutes > end) {
      daysUntil = DAYS_PER_WEEK;
    }

    const offset = daysUntil * MINUTES_PER_DAY + start - nowMinutes;

    if (offset < bestOffset) {
      bestOffset = offset;
      best = {
        classId: item.id,
        title: item.title,
        level: item.level,
        weekday: item.weekday,
        startTime: item.startTime,
        endTime: item.endTime,
        minutesUntilStart: Math.max(0, offset),
        daysUntil,
      };
    }
  }

  return best;
}

/** `95` → `1h35`. Usado no "sua próxima aula começa em…". */
export function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;

  if (hours === 0) return `${rest}min`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h${String(rest).padStart(2, '0')}`;
}

/** Turmas do aluno agrupadas por dia da semana, para o painel. */
export function groupAssignedByWeekday(
  classes: readonly ScheduledClass[],
  assignedIds: readonly string[],
): { weekday: number; classes: ScheduledClass[] }[] {
  const byDay = new Map<number, ScheduledClass[]>();

  for (const item of assigned(classes, assignedIds)) {
    const bucket = byDay.get(item.weekday);
    if (bucket) bucket.push(item);
    else byDay.set(item.weekday, [item]);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([weekday, items]) => ({
      weekday,
      classes: items.sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }));
}
