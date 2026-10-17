import type { Metadata } from 'next';

import { PageHeader } from '@/components/app/PageHeader';

import { listEvents } from '@/lib/repositories/calendar';
import { listStudentsByStatus } from '@/lib/repositories/students';
import { getUnitScope } from '@/lib/unitScope';
import { filterByUnit } from '@/types/domain';
import { getSchedule } from '@/lib/schedule';
import { saoPauloDateString, saoPauloParts } from '@/utils/datetime';
import { listKidsAgenda, type KidsStudent } from '@/utils/graduationEngine';
import type { PredictedGraduation, RecurringClass } from '@/utils/calendarMonth';
import type { PersonLike } from '@/utils/roster';

import { CalendarView } from './CalendarView';

export const metadata: Metadata = { title: 'Calendário' };
export const dynamic = 'force-dynamic';

export default async function CalendarioPage() {
  const now = new Date();

  const scope = await getUnitScope();

  const [schedule, eventos, todos] = await Promise.all([
    getSchedule(),
    listEvents(),
    listStudentsByStatus('ativo'),
  ]);

  // O calendário é da academia escolhida: grade, eventos e graduações.
  const active = filterByUnit(todos, scope);
  const events = eventos;

  const classes: RecurringClass[] = filterByUnit(schedule.classes, scope).map((slot) => ({
    id: slot.id,
    weekday: slot.weekday,
    startTime: slot.startTime,
    endTime: slot.endTime,
    title: slot.title,
    level: slot.level,
  }));

  // As graduações previstas não são gravadas: saem do mesmo motor da agenda.
  const kidsRecords = active.filter(
    (student) => student.category === 'kids' && student.birthDate.length > 0,
  );
  const kidsStudents: KidsStudent[] = kidsRecords.map((student) => ({
    id: student.id,
    name: student.name,
    birthDate: student.birthDate,
    joinedAt: student.joinedAt ?? student.createdAt,
    lastGraduationAt: student.lastGraduationAt,
    degree: student.degree,
    belt: student.belt,
    graduatesMonthly: student.graduatesMonthly,
  }));
  const nomes = new Map(kidsRecords.map((s) => [s.id, s.name]));

  const graduations: PredictedGraduation[] = listKidsAgenda(kidsStudents, now)
    .filter((r) => r.status === 'ELEGIVEL' || r.status === 'AGUARDANDO')
    .map((r) => ({
      studentId: r.studentId,
      studentName: nomes.get(r.studentId) ?? 'Aluno',
      date: r.eligibleAt,
      nextDegree: r.nextDegree,
      stripeColor: r.nextDegreeColor,
    }));

  // Aniversariantes: todo aluno ativo com data de nascimento no cadastro.
  const people: PersonLike[] = active
    .filter((student) => student.birthDate.length > 0)
    .map((student) => ({ id: student.id, name: student.name, birthDate: student.birthDate }));

  const { year, month } = saoPauloParts(now);

  return (
    <div>
      <PageHeader
        title="Calendário"
      />

      <div className="mt-8">
        <CalendarView
          classes={classes}
          events={events}
          graduations={graduations}
          people={people}
          today={saoPauloDateString(now)}
          initialYear={year}
          initialMonth={month}
        />
      </div>
    </div>
  );
}
