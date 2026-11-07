import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { resolveActiveProfile } from '@/lib/activeProfile';
import { getSessionUser } from '@/lib/auth';
import { listEvents } from '@/lib/repositories/calendar';
import { getStudent } from '@/lib/repositories/students';
import { getEffectiveSchedule } from '@/lib/schedule';
import { classesForStudent } from '@/utils/classAttendees';
import { recurringOnly } from '@/utils/classOverrides';
import { saoPauloDateString, saoPauloParts } from '@/utils/datetime';
import { getKidsGraduationStatus } from '@/utils/graduationEngine';
import type { DatedEvent, PredictedGraduation, RecurringClass } from '@/utils/calendarMonth';

import { StudentCalendar } from './StudentCalendar';

export const metadata: Metadata = { title: 'Calendário' };
export const dynamic = 'force-dynamic';

/**
 * O mês do aluno.
 *
 * Recorte dele e só dele: as turmas em que está matriculado, as aulas dessas
 * turmas que foram canceladas ou remarcadas, os eventos da academia e a
 * própria graduação prevista.
 *
 * Fora ficam a grade das outras turmas e os aniversários dos colegas. O
 * aniversário é o que mais pesa: data de nascimento é dado pessoal, boa parte
 * da base é de menores de idade, e publicar a lista para todo aluno seria
 * vazamento mesmo sem mostrar o ano.
 */
export default async function CalendarioDoAlunoPage() {
  const user = await getSessionUser();
  if (!user) redirect('/entrar');

  /*
   * O calendário é do perfil ativo.
   *
   * Com `getStudent(user.id)` o pai que trocou para o perfil do filho via as
   * aulas **dele** — a do adulto às 20:30 em vez da infantil às 18:30 —, e a
   * graduação prevista também era a dele. Toda tela do painel tem de sair da
   * mesma resolução; é o que a barra de perfis promete.
   */
  const perfil = await resolveActiveProfile(user.id, await getStudent(user.id));
  if (!perfil) redirect('/onboarding');

  const student = perfil.student;

  const now = new Date();
  const today = saoPauloDateString(now);

  const [schedule, eventos] = await Promise.all([getEffectiveSchedule(now), listEvents()]);

  // As turmas da ficha dele, mais as abertas da academia dele. A regra é a
  // mesma da chamada do professor — ver `utils/classAttendees`.
  const minhas = classesForStudent(schedule.classes, student);

  /*
   * A grade projetada no mês vem das turmas recorrentes.
   *
   * A ocorrência personalizada é a mesma turma em outro horário num dia só —
   * entrando aqui, ela viraria uma aula semanal a mais. O que ela precisa
   * trazer para o calendário é a exceção daquele dia, e isso vem de
   * `canceledDates` e das próprias ocorrências datadas.
   *
   * A turma avulsa entra por fora, como evento do dia: por `recurringOnly`
   * ela seria descartada, e sem ele viraria uma aula de todo sábado.
   */
  const avulsas: DatedEvent[] = minhas
    .filter((slot) => slot.openToAll === true && slot.onlyOnDate !== undefined)
    .map((slot) => ({
      id: slot.id,
      date: slot.onlyOnDate as string,
      title: slot.title,
      kind: 'evento' as const,
      time: slot.startTime,
      note: `Aula aberta · ${slot.startTime} às ${slot.endTime}${slot.level ? ` · ${slot.level}` : ''}`,
      closesAcademy: false,
    }));

  const classes: RecurringClass[] = recurringOnly(minhas).map((slot) => ({
    id: slot.id,
    weekday: slot.weekday,
    startTime: slot.startTime,
    endTime: slot.endTime,
    title: slot.title,
    level: slot.level,
  }));

  /*
   * Datas em que uma turma dele não acontece, agrupadas por dia.
   *
   * `buildMonth` projeta a turma pelo dia da semana e não conhece exceção;
   * sem este mapa o aluno veria no calendário a aula de um dia em que o
   * professor já avisou que não vai ter treino.
   */
  const canceledDates: Record<string, string[]> = {};
  for (const slot of minhas) {
    for (const date of slot.canceledDates ?? []) {
      const bucket = canceledDates[date];
      if (bucket) bucket.push(slot.id);
      else canceledDates[date] = [slot.id];
    }
  }

  /*
   * A graduação prevista — só a dele.
   *
   * Vale para a trilha infantil, que é a que tem previsão automática. Adulto
   * gradua por decisão do professor, e inventar uma data no calendário dele
   * seria prometer o que o sistema não sabe.
   */
  const graduations: PredictedGraduation[] = [];
  if (student.category === 'kids' && student.birthDate.length > 0) {
    const status = getKidsGraduationStatus(
      {
        id: student.id,
        name: student.name,
        birthDate: student.birthDate,
        joinedAt: student.joinedAt ?? student.createdAt,
        lastGraduationAt: student.lastGraduationAt,
        degree: student.degree,
        belt: student.belt,
        graduatesMonthly: student.graduatesMonthly,
      },
      now,
    );

    if (status.status === 'ELEGIVEL' || status.status === 'AGUARDANDO') {
      graduations.push({
        studentId: student.id,
        studentName: 'Seu próximo grau',
        date: status.eligibleAt,
        nextDegree: status.nextDegree,
        stripeColor: status.nextDegreeColor,
      });
    }
  }

  const { year, month } = saoPauloParts(now);

  return (
    <div className="page-stack">
      <header>
        <p className="eyebrow">Agenda</p>
        <h1 className="mt-2 text-3xl leading-none sm:text-4xl">Calendário</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Suas aulas da semana, os eventos da academia e o que mudou nos seus dias de treino.
        </p>
      </header>

      {classes.length === 0 && eventos.length === 0 && avulsas.length === 0 ? (
        <div className="panel px-6 py-16 text-center">
          <p className="font-display text-lg uppercase tracking-tight">Nada marcado ainda</p>
          <p className="mt-2 text-sm text-muted">
            Assim que a recepção definir suas turmas, elas aparecem aqui.
          </p>
        </div>
      ) : (
        <StudentCalendar
          classes={classes}
          events={[...eventos, ...avulsas]}
          graduations={graduations}
          canceledDates={canceledDates}
          today={today}
          initialYear={year}
          initialMonth={month}
        />
      )}
    </div>
  );
}
