/**
 * Mescla das aulas personalizadas sobre a grade.
 *
 * Função pura, sem I/O: recebe a grade e as exceções e devolve a grade como
 * ela realmente vai acontecer. É o único lugar que sabe traduzir "hoje o MMA
 * é 18:30" para algo que o motor de presença entenda — e, por ser pura, dá
 * para enumerar os casos em teste.
 *
 * Cada exceção vira **duas** marcas na lista:
 *
 *   1. a turma recorrente ganha aquela data em `skipDates`, para não liberar
 *      check-in no horário normal que não vai ter aula;
 *   2. uma ocorrência nova entra com `onlyOnDate` na data e o horário novo,
 *      **mantendo o id da turma** — é o que faz a presença cair na turma de
 *      verdade e entrar no ranking e no relatório sem tratamento especial.
 *
 * As duas carregam o mesmo id de propósito. Nunca aparecem juntas no mesmo
 * dia (uma exclui a outra pela data), mas quem renderizar a grade mesclada em
 * lista precisa saber disso ao escolher a chave do React.
 */

import type { ClassSlot } from '@/data/seed';
import { weekdayOf } from './datetime';

/** O mínimo que a mescla precisa saber de uma exceção. */
export interface ClassOverrideTimes {
  /** Turma da grade que muda de horário. */
  readonly classId: string;
  /** `YYYY-MM-DD` — dia civil em São Paulo. */
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
}

export function applyClassOverrides(
  classes: readonly ClassSlot[],
  overrides: readonly ClassOverrideTimes[],
): ClassSlot[] {
  if (overrides.length === 0) return [...classes];

  const byId = new Map<string, ClassSlot>();
  for (const slot of classes) byId.set(slot.id, slot);

  const skipByClass = new Map<string, string[]>();
  const occurrences: ClassSlot[] = [];

  for (const override of overrides) {
    const base = byId.get(override.classId);

    // Turma apagada da grade depois da exceção ter sido criada. Sem turma não
    // há matrícula para conferir, então a exceção deixa de existir junto.
    if (!base) continue;

    const dates = skipByClass.get(base.id);
    if (dates) dates.push(override.date);
    else skipByClass.set(base.id, [override.date]);

    occurrences.push({
      ...base,
      weekday: weekdayOf(override.date) as ClassSlot['weekday'],
      startTime: override.startTime,
      endTime: override.endTime,
      onlyOnDate: override.date,
    });
  }

  const recurring = classes.map((slot) => {
    const skip = skipByClass.get(slot.id);
    return skip ? { ...slot, skipDates: skip } : slot;
  });

  return [...recurring, ...occurrences];
}

/**
 * Só as turmas recorrentes da grade, sem as ocorrências de data única.
 *
 * Existe para quem conta repetição no mês ou desenha a semana: ali uma aula
 * personalizada seria contada como se acontecesse toda semana.
 */
export function recurringOnly(classes: readonly ClassSlot[]): ClassSlot[] {
  return classes.filter((slot) => slot.onlyOnDate === undefined);
}
