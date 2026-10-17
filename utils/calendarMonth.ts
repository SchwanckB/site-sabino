/**
 * Montagem do mês do calendário — função pura, sem I/O.
 *
 * Junta três fontes que vivem em lugares diferentes:
 *   1. aulas recorrentes, da grade de horários;
 *   2. eventos avulsos, marcados pelo professor;
 *   3. graduações infantis previstas, calculadas pelo motor.
 *
 * Nada disso é gravado por dia — o calendário é derivado. Assim, mudar a grade
 * ou registrar um grau reflete no mês inteiro sem migração de dados.
 */

import { civilDate, lastDayOfMonth, saoPauloDateString } from './datetime';

export type CalendarItemKind =
  | 'aula'
  | 'evento'
  | 'feriado'
  | 'graduacao'
  | 'aviso'
  | 'aniversario';

export interface CalendarItem {
  readonly id: string;
  readonly kind: CalendarItemKind;
  readonly title: string;
  /** `HH:mm`, ou vazio para o dia todo. */
  readonly time: string;
  /** Linha de apoio: nível da turma, grau previsto, observação do evento. */
  readonly detail: string;
  /** Só para aulas — permite filtrar por turma específica. */
  readonly classId: string | null;
}

export interface CalendarDay {
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly dayOfMonth: number;
  readonly weekday: number;
  readonly inMonth: boolean;
  readonly isToday: boolean;
  readonly items: readonly CalendarItem[];
}

export interface RecurringClass {
  readonly id: string;
  readonly weekday: number;
  readonly startTime: string;
  readonly endTime: string;
  readonly title: string;
  readonly level: string;
}

export interface DatedEvent {
  readonly id: string;
  readonly date: string;
  readonly title: string;
  readonly kind: 'evento' | 'feriado' | 'graduacao' | 'aviso';
  readonly time: string;
  readonly note: string;
  readonly closesAcademy: boolean;
}

export interface PredictedGraduation {
  readonly studentId: string;
  readonly studentName: string;
  /** `YYYY-MM-DD` previsto. */
  readonly date: string;
  readonly nextDegree: number | null;
  readonly stripeColor: string | null;
}

export interface DatedBirthday {
  readonly id: string;
  /** `YYYY-MM-DD` já no mês exibido. */
  readonly date: string;
  readonly name: string;
  readonly turning: number;
}

export interface MonthSources {
  readonly classes: readonly RecurringClass[];
  readonly events: readonly DatedEvent[];
  readonly graduations: readonly PredictedGraduation[];
  readonly birthdays?: readonly DatedBirthday[];
}

/** Dias da grade exibida: sempre semanas completas, começando no domingo. */
export function buildMonth(
  year: number,
  month: number,
  sources: MonthSources,
  now: Date,
): CalendarDay[] {
  const today = saoPauloDateString(now);

  const firstOfMonth = civilDate(year, month, 1);
  const firstWeekday = weekdayOf(firstOfMonth);
  const daysInMonth = lastDayOfMonth(year, month);

  // Completa a primeira e a última semana com os dias vizinhos.
  const total = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const start = -firstWeekday;

  const eventsByDate = new Map<string, DatedEvent[]>();
  for (const event of sources.events) {
    const bucket = eventsByDate.get(event.date);
    if (bucket) bucket.push(event);
    else eventsByDate.set(event.date, [event]);
  }

  const graduationsByDate = new Map<string, PredictedGraduation[]>();
  for (const graduation of sources.graduations) {
    const bucket = graduationsByDate.get(graduation.date);
    if (bucket) bucket.push(graduation);
    else graduationsByDate.set(graduation.date, [graduation]);
  }

  const birthdaysByDate = new Map<string, DatedBirthday[]>();
  for (const birthday of sources.birthdays ?? []) {
    const bucket = birthdaysByDate.get(birthday.date);
    if (bucket) bucket.push(birthday);
    else birthdaysByDate.set(birthday.date, [birthday]);
  }

  const days: CalendarDay[] = [];

  for (let offset = 0; offset < total; offset++) {
    const dayNumber = start + offset + 1;
    const date = civilDateFromOffset(year, month, dayNumber);
    const weekday = weekdayOf(date);

    const dayEvents = eventsByDate.get(date) ?? [];
    const fechado = dayEvents.some((event) => event.closesAcademy);

    const items: CalendarItem[] = [];

    // Feriado que fecha a academia some com as aulas daquele dia.
    if (!fechado) {
      for (const slot of sources.classes) {
        if (slot.weekday !== weekday) continue;
        items.push({
          id: `${date}-${slot.id}`,
          kind: 'aula',
          title: slot.title,
          time: slot.startTime,
          detail: `${slot.startTime}–${slot.endTime} · ${slot.level}`,
          classId: slot.id,
        });
      }
    }

    for (const event of dayEvents) {
      items.push({
        id: `${date}-${event.id}`,
        kind: event.kind,
        title: event.title,
        time: event.time,
        detail: event.note,
        classId: null,
      });
    }

    for (const graduation of graduationsByDate.get(date) ?? []) {
      const grau = graduation.nextDegree === null ? '' : `grau ${graduation.nextDegree}`;
      const tarja = graduation.stripeColor ? `tarja ${graduation.stripeColor}` : '';

      items.push({
        id: `${date}-grad-${graduation.studentId}`,
        kind: 'graduacao',
        title: graduation.studentName,
        time: '',
        detail: [grau, tarja].filter(Boolean).join(' · '),
        classId: null,
      });
    }

    for (const birthday of birthdaysByDate.get(date) ?? []) {
      items.push({
        id: `${date}-aniv-${birthday.id}`,
        kind: 'aniversario',
        title: birthday.name,
        time: '',
        detail: `faz ${birthday.turning} anos`,
        classId: null,
      });
    }

    items.sort((a, b) => {
      // Dia inteiro primeiro, depois por horário.
      if (a.time === '' && b.time !== '') return -1;
      if (a.time !== '' && b.time === '') return 1;
      return a.time.localeCompare(b.time);
    });

    days.push({
      date,
      dayOfMonth: Number(date.slice(8, 10)),
      weekday,
      inMonth: dayNumber >= 1 && dayNumber <= daysInMonth,
      isToday: date === today,
      items,
    });
  }

  return days;
}

/** Avança ou retrocede meses sem estourar o ano. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const;

export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

/* -------------------------------------------------------------------------- */

/** 0 = domingo. Calculado em UTC para não depender do fuso da máquina. */
function weekdayOf(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).getUTCDay();
}

/** Dia `n` do mês, aceitando n <= 0 ou n > último dia (vizinhos da grade). */
function civilDateFromOffset(year: number, month: number, dayNumber: number): string {
  const date = new Date(Date.UTC(year, month - 1, dayNumber));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}
