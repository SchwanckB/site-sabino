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

import {
  addDays,
  daysBetween,
  saoPauloDateString,
  saoPauloMinutesOfDay,
  saoPauloParts,
  timeToMinutes,
  weekdayOf,
} from './datetime';

/**
 * Quanto antes do início a presença já é aceita.
 *
 * Uma hora, e não meia: o aluno chega cedo, troca de roupa e aquece, e o
 * professor não quer fila no cartaz no meio do treino. Com trinta minutos,
 * quem chegava antes lia "nenhuma das suas turmas está acontecendo agora" e
 * desistia de marcar.
 *
 * O preço é conhecido: a janela de horário é uma das três travas que seguram
 * o check-in de casa (ver `lib/repositories/qr.ts`), e ela fica mais larga —
 * dos dois lados, desde que {@link CHECKIN_LATE_MINUTES} também subiu para uma
 * hora. Continuam de pé a matrícula na turma e a presença única por dia, que
 * são as travas que de fato sustentam o número.
 */
export const CHECKIN_EARLY_MINUTES = 60;

/**
 * Quanto depois do fim a presença ainda é aceita.
 *
 * Uma hora, simétrica à abertura. Eram quinze minutos, e o caso que derrubou
 * esse número é concreto: aula das 20:30 às 21:30, o aluno escaneia o cartaz
 * às 21:54 e lê "nenhuma das suas turmas está acontecendo agora". Ele estava
 * na academia e havia treinado a aula inteira — perdeu a presença por nove
 * minutos, porque depois do treino ainda se troca de roupa e se conversa
 * antes de lembrar do QR. O check-in do fim da aula é o hábito real, e a
 * janela tem de caber nele.
 *
 * Simétrica de propósito: "abre uma hora antes, fecha uma hora depois" é
 * regra que o professor repete de cabeça quando o aluno pergunta. Quinze de
 * um lado e sessenta do outro não se lembra, e o que não se lembra vira
 * reclamação na recepção.
 *
 * O custo em ambiguidade é pequeno. Com as turmas encostadas de hora em hora,
 * quem está em duas já via a tela de escolha por causa da janela de abertura;
 * a aula em andamento aparece sempre primeiro na lista.
 */
export const CHECKIN_LATE_MINUTES = 60;

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
  /**
   * Data civil única em que esta aula acontece (`YYYY-MM-DD`) — aula
   * personalizada. Ausente na turma recorrente da grade.
   *
   * Uma aula com data **não se repete na semana seguinte**: passou o dia,
   * passou a aula. É isso que diferencia "hoje o MMA é 18:30" de uma mudança
   * de horário na grade.
   */
  readonly onlyOnDate?: string;
  /**
   * Datas civis em que esta turma recorrente **não** acontece, porque foi
   * remarcada para outro horário naquele dia.
   *
   * Sem isso, o aluno veria a aula duas vezes no dia da exceção: no horário
   * normal e no personalizado — e poderia bater presença no horário que a
   * turma não vai ter.
   */
  readonly skipDates?: readonly string[];
}

/**
 * `true` se a aula acontece nesta data civil.
 *
 * O dia da semana sozinho não responde mais: desde a aula personalizada, a
 * grade carrega tanto ocorrências de data única quanto turmas recorrentes com
 * dias furados.
 */
function occursOn(item: ScheduledClass, date: string, weekday: number): boolean {
  if (item.onlyOnDate !== undefined) return item.onlyOnDate === date;
  if (item.weekday !== weekday) return false;
  return !(item.skipDates ?? []).includes(date);
}

/**
 * `true` se a aula acontece nesta data civil (`YYYY-MM-DD`).
 *
 * Para as telas que listam "as aulas de hoje": filtrar por dia da semana ali
 * mostraria a turma remarcada duas vezes, no horário normal e no novo.
 */
export function occursOnDate(item: ScheduledClass, date: string): boolean {
  return occursOn(item, date, weekdayOf(date));
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
  /**
   * `true` quando é uma aula personalizada — a turma em horário diferente do
   * normal, só nesse dia. A tela avisa: o aluno decorou o outro horário.
   */
  readonly custom: boolean;
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
  const today = saoPauloDateString(now);
  const nowMinutes = saoPauloMinutesOfDay(now);

  return assigned(classes, assignedIds)
    .filter((item) => occursOn(item, today, weekday))
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
    .sort((a, b) => {
      // A aula que está rolando vem antes da que começa daqui a uma hora. Com
      // a janela de sessenta minutos e turmas encostadas na grade (18:30,
      // 19:30, 20:30), as duas aparecem juntas na tela do aluno — e só a
      // distância em minutos empatava as duas às 19:00.
      if (a.inProgress !== b.inProgress) return a.inProgress ? -1 : 1;
      return Math.abs(a.minutesUntilStart) - Math.abs(b.minutesUntilStart);
    });
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
  const today = saoPauloDateString(now);
  const nowMinutes = saoPauloMinutesOfDay(now);

  let best: UpcomingClass | null = null;
  let bestOffset = Number.POSITIVE_INFINITY;

  for (const item of mine) {
    const start = timeToMinutes(item.startTime);
    const end = timeToMinutes(item.endTime);

    let daysUntil: number;

    if (item.onlyOnDate !== undefined) {
      // Aula personalizada não dá a volta na semana: passou o dia, acabou.
      daysUntil = daysBetween(item.onlyOnDate, today);
      if (daysUntil < 0) continue;
      if (daysUntil === 0 && nowMinutes > end) continue;
    } else {
      // Dias até a próxima ocorrência deste dia da semana.
      daysUntil = (item.weekday - weekday + DAYS_PER_WEEK) % DAYS_PER_WEEK;

      // Hoje, mas já terminou: só volta na semana que vem.
      if (daysUntil === 0 && nowMinutes > end) {
        daysUntil = DAYS_PER_WEEK;
      }

      // Pula a semana em que a turma foi remarcada: quem pergunta pela próxima
      // aula quer o dia e a hora em que ela vai acontecer de verdade — a
      // ocorrência daquele dia já está na lista como aula personalizada.
      const skip = item.skipDates ?? [];
      for (let guard = 0; guard <= DAYS_PER_WEEK; guard += 1) {
        if (!skip.includes(addDays(today, daysUntil))) break;
        daysUntil += DAYS_PER_WEEK;
      }
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
        custom: item.onlyOnDate !== undefined,
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

  // Acima de um dia, hora e minuto não dizem nada: "116h51" até a próxima aula
  // obriga o aluno a fazer conta. Em dias a frase se lê de primeira.
  if (hours >= 24) {
    const days = Math.round(safe / (60 * 24));
    return days === 1 ? '1 dia' : `${days} dias`;
  }

  if (hours === 0) return `${rest}min`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h${String(rest).padStart(2, '0')}`;
}

/**
 * Turmas do aluno agrupadas por dia da semana, para o painel.
 *
 * Aula personalizada fica de fora: esta é a rotina semanal do aluno, e uma
 * ocorrência de um dia só apareceria como se fosse treino de toda semana. O
 * aluno vê a exceção na próxima aula e na hora do check-in.
 */
export function groupAssignedByWeekday(
  classes: readonly ScheduledClass[],
  assignedIds: readonly string[],
): { weekday: number; classes: ScheduledClass[] }[] {
  const byDay = new Map<number, ScheduledClass[]>();

  for (const item of assigned(classes, assignedIds)) {
    if (item.onlyOnDate !== undefined) continue;
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
