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
  /** `true` quando a aula daquele dia foi cancelada, e não remarcada. */
  readonly canceled?: boolean;
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const current = map.get(key);
  if (current) current.push(value);
  else map.set(key, [value]);
}

export function applyClassOverrides(
  classes: readonly ClassSlot[],
  overrides: readonly ClassOverrideTimes[],
): ClassSlot[] {
  if (overrides.length === 0) return [...classes];

  const byId = new Map<string, ClassSlot>();
  for (const slot of classes) byId.set(slot.id, slot);

  const skipByClass = new Map<string, string[]>();
  const canceledByClass = new Map<string, string[]>();
  const occurrences: ClassSlot[] = [];

  for (const override of overrides) {
    const base = byId.get(override.classId);

    // Turma apagada da grade depois da exceção ter sido criada. Sem turma não
    // há matrícula para conferir, então a exceção deixa de existir junto.
    if (!base) continue;

    // Nos dois casos a turma não acontece no horário normal. A diferença é o
    // que entra no lugar: a aula remarcada ganha uma ocorrência nova, a
    // cancelada não ganha nada.
    push(skipByClass, base.id, override.date);

    if (override.canceled === true) {
      push(canceledByClass, base.id, override.date);
      continue;
    }

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
    if (!skip) return slot;

    const canceled = canceledByClass.get(slot.id);
    return canceled ? { ...slot, skipDates: skip, canceledDates: canceled } : { ...slot, skipDates: skip };
  });

  return [...recurring, ...occurrences];
}

/**
 * Turmas do aluno canceladas nesta data.
 *
 * O aluno precisa ver isto. Sem o aviso, o cancelamento só apareceria como
 * ausência da aula na tela — ele viajaria até a academia para descobrir na
 * porta. É por isso que cancelada e remarcada são marcas separadas: as duas
 * tiram a turma do horário normal, mas só uma significa "não venha".
 */
export function canceledOn(
  classes: readonly ClassSlot[],
  assignedIds: readonly string[],
  date: string,
): ClassSlot[] {
  const allowed = new Set(assignedIds);
  return classes.filter(
    (slot) => allowed.has(slot.id) && (slot.canceledDates ?? []).includes(date),
  );
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
