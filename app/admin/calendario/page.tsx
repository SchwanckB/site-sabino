import type { Metadata } from 'next';

import { listEvents } from '@/lib/repositories/calendar';
import { listStudentsByStatus } from '@/lib/repositories/students';
import { getSchedule } from '@/lib/schedule';
import { saoPauloDateString, saoPauloParts } from '@/utils/datetime';
import { listKidsAgenda, type KidsStudent } from '@/utils/graduationEngine';
import type { PredictedGraduation, RecurringClass } from '@/utils/calendarMonth';

import { CalendarView } from './CalendarView';

export const metadata: Metadata = { title: 'Calendário' };
export const dynamic = 'force-dynamic';

export default async function CalendarioPage() {
  const now = new Date();

  const [schedule, events, active] = await Promise.all([
    getSchedule(),
    listEvents(),
    listStudentsByStatus('ativo'),
  ]);

  const classes: RecurringClass[] = schedule.classes.map((slot) => ({
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

  const { year, month } = saoPauloParts(now);

  return (
    <div>
      <header>
        <p className="eyebrow">Agenda</p>
        <h1 className="mt-2 text-3xl leading-none sm:text-4xl">Calendário</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Junta três coisas num lugar só: as aulas da grade, os eventos que você marcar e as
          graduações infantis previstas. Use os filtros para isolar o que interessa.
        </p>
      </header>

      <div className="mt-8">
        <CalendarView
          classes={classes}
          events={events}
          graduations={graduations}
          today={saoPauloDateString(now)}
          initialYear={year}
          initialMonth={month}
        />
      </div>
    </div>
  );
}
