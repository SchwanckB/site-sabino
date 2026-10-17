/**
 * Relatório por turma — função pura.
 *
 * Responde a pergunta que a lista de alunos não responde: *qual horário está
 * esvaziando*. "Sumidos do tatame" mostra o aluno que parou; isto mostra a
 * turma inteira perdendo gente, que é quando ainda dá para agir mudando o
 * horário ou falando com o grupo.
 */

import { daysBetween, saoPauloDateString } from './datetime';

export interface ReportClass {
  readonly id: string;
  readonly label: string;
  readonly weekday: number;
  readonly startTime: string;
}

export interface ReportStudent {
  readonly id: string;
  readonly classIds: readonly string[];
}

export interface ReportCheckin {
  readonly studentId: string;
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly classId: string | null;
}

export interface ClassReportRow {
  readonly id: string;
  readonly label: string;
  /** Alunos com a turma atribuída. */
  readonly enrolled: number;
  /** Presenças nos últimos 30 dias. */
  readonly recent: number;
  /** Presenças nos 30 dias anteriores a esses. */
  readonly previous: number;
  /** Alunos distintos que apareceram nos últimos 30 dias. */
  readonly activeStudents: number;
  /** Quantas vezes a aula aconteceu na janela recente. */
  readonly sessions: number;
  /** Média de alunos por aula. */
  readonly averagePerSession: number;
  /** Variação contra a janela anterior, de -1 a +∞. `null` sem base. */
  readonly trend: number | null;
}

export const REPORT_WINDOW_DAYS = 30;

export function buildClassReport(
  classes: readonly ReportClass[],
  students: readonly ReportStudent[],
  checkins: readonly ReportCheckin[],
  now: Date,
): ClassReportRow[] {
  const hoje = saoPauloDateString(now);

  return classes
    .map((slot) => {
      const matriculados = students.filter((student) => student.classIds.includes(slot.id));

      // Só presenças daquela turma. Check-in antigo sem `classId` fica de fora
      // de propósito: atribuí-lo a uma turma pelo horário seria chute.
      const daTurma = checkins.filter((entry) => entry.classId === slot.id);

      const recentes = daTurma.filter((entry) => {
        const dias = daysBetween(hoje, entry.date);
        return dias >= 0 && dias < REPORT_WINDOW_DAYS;
      });

      const anteriores = daTurma.filter((entry) => {
        const dias = daysBetween(hoje, entry.date);
        return dias >= REPORT_WINDOW_DAYS && dias < REPORT_WINDOW_DAYS * 2;
      });

      const sessions = countWeekdayOccurrences(slot.weekday, hoje, REPORT_WINDOW_DAYS);

      return {
        id: slot.id,
        label: slot.label,
        enrolled: matriculados.length,
        recent: recentes.length,
        previous: anteriores.length,
        activeStudents: new Set(recentes.map((entry) => entry.studentId)).size,
        sessions,
        averagePerSession: sessions === 0 ? 0 : recentes.length / sessions,
        trend: anteriores.length === 0 ? null : (recentes.length - anteriores.length) / anteriores.length,
      };
    })
    // Turma mais cheia primeiro; vazias no fim, que é onde elas chamam atenção.
    .sort((a, b) => b.recent - a.recent || a.label.localeCompare(b.label, 'pt-BR'));
}

/**
 * Quantas vezes um dia da semana caiu na janela.
 *
 * Usado como denominador da média. Um mês tem 4 ou 5 ocorrências de cada dia,
 * e arredondar para 4,3 daria média errada na turma que treina uma vez por
 * semana — justamente a infantil.
 */
export function countWeekdayOccurrences(
  weekday: number,
  endDate: string,
  windowDays: number,
): number {
  const fim = Date.UTC(
    Number(endDate.slice(0, 4)),
    Number(endDate.slice(5, 7)) - 1,
    Number(endDate.slice(8, 10)),
  );

  let total = 0;
  for (let i = 0; i < windowDays; i++) {
    const dia = new Date(fim - i * 86_400_000);
    if (dia.getUTCDay() === weekday) total += 1;
  }

  return total;
}

/**
 * Quantas vezes um dia da semana cai num mês civil.
 *
 * Base da meta mensal do aluno: a turma que treina segunda e quinta tem 8 ou
 * 9 aulas no mês, e é contra esse número que faz sentido medir presença.
 */
export function occurrencesInMonth(weekday: number, year: number, month: number): number {
  const ultimoDia = new Date(Date.UTC(year, month, 0)).getUTCDate();

  let total = 0;
  for (let dia = 1; dia <= ultimoDia; dia++) {
    if (new Date(Date.UTC(year, month - 1, dia)).getUTCDay() === weekday) total += 1;
  }

  return total;
}
