/**
 * Quem entra na chamada de uma aula.
 *
 * Função pura, e separada de propósito: a regra vale para o Modo aula e para
 * a tela de Presença, e as duas a tinham escrita à mão — `classIds.includes`.
 * Com a turma avulsa isso deixou de ser verdade num caso, e uma regra
 * duplicada é uma regra que só é corrigida num lugar.
 */

/** O mínimo que a regra precisa saber da aula. */
export interface AttendeeClass {
  readonly id: string;
  readonly unit: string;
  /** `true` na turma avulsa: aberta a quem aparecer. */
  readonly openToAll?: boolean;
}

/** O mínimo que a regra precisa saber do aluno. */
export interface AttendeeStudent {
  readonly unit: string;
  readonly classIds: readonly string[];
}

/**
 * `true` se este aluno pertence à chamada desta aula.
 *
 * Na grade normal, pertence quem tem a turma na ficha — é essa matrícula que
 * impede alguém de marcar presença em turma que não é dele.
 *
 * Na turma avulsa não há matrícula: ela não existe na grade, foi aberta para
 * um dia só, e exigir que o professor a adicione à ficha de trinta alunos
 * para um sábado é o mesmo que não ter o sábado. Vale, então, a unidade: o
 * treino aberto de Três Cachoeiras é para quem treina em Três Cachoeiras.
 */
export function belongsToClass(student: AttendeeStudent, slot: AttendeeClass): boolean {
  if (slot.openToAll === true) return student.unit === slot.unit;
  return student.classIds.includes(slot.id);
}

/** Os alunos da chamada desta aula, na ordem em que vieram. */
export function attendeesOf<T extends AttendeeStudent>(
  students: readonly T[],
  slot: AttendeeClass,
): T[] {
  return students.filter((student) => belongsToClass(student, slot));
}
