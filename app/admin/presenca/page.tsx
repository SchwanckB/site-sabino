import type { Metadata } from 'next';

import { PageHeader } from '@/components/app/PageHeader';

import { getTodayCheckins } from '@/lib/repositories/attendance';
import { listStudentsByStatus } from '@/lib/repositories/students';
import { getUnitScope } from '@/lib/unitScope';
import { filterByUnit } from '@/types/domain';
import { getSchedule } from '@/lib/schedule';
import { weekdayShortLabels, type Weekday } from '@/data/seed';
import { findOpenClasses } from '@/utils/attendanceEngine';
import { saoPauloParts } from '@/utils/datetime';

import { PresenceList, type PresenceRow, type TurmaResumo } from './PresenceList';

export const metadata: Metadata = { title: 'Presença' };
export const dynamic = 'force-dynamic';

export default async function PresencaPage() {
  const now = new Date();

  const scope = await getUnitScope();

  const [todos, schedule] = await Promise.all([
    listStudentsByStatus('ativo'),
    getSchedule(),
  ]);

  // A chamada é sempre de uma academia: lista e grade seguem o recorte.
  const students = filterByUnit(todos, scope);
  const classes = filterByUnit(schedule.classes, scope);

  const checkins = await getTodayCheckins(
    students.map((student) => student.id),
    now,
  );

  const rows: PresenceRow[] = students
    .map((student) => {
      const open = findOpenClasses(classes, student.classIds, now);
      const entry = checkins.get(student.id) ?? null;

      return {
        id: student.id,
        name: student.name,
        belt: student.belt,
        degree: student.degree,
        inClassNow: open[0] ? `${open[0].title} · ${open[0].startTime}` : null,
        present: entry !== null,
        presentAt: entry ? entry.at.slice(11, 16) : null,
        presentSource: entry?.source ?? null,
        classIds: student.classIds,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  // Turmas da academia, com marca de qual está acontecendo agora.
  const abertas = new Set(
    findOpenClasses(classes, classes.map((slot) => slot.id), now).map((slot) => slot.classId),
  );
  const turmas: TurmaResumo[] = classes.map((slot) => ({
    id: slot.id,
    label: `${weekdayShortLabels[slot.weekday as Weekday]} ${slot.startTime} · ${slot.title}`,
    openNow: abertas.has(slot.id),
  }));

  const { day, month, year } = saoPauloParts(now);
  const todayLabel = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;

  return (
    <div>
      <PageHeader
        title="Presença"
      />

      {students.length === 0 ? (
        <div className="surface-card mt-8 px-6 py-16 text-center">
          <p className="font-display text-lg uppercase tracking-tight">Nenhum aluno ativo</p>
          <p className="mt-2 text-sm text-muted">
            Aprove os cadastros em Aprovações para que eles apareçam na chamada.
          </p>
        </div>
      ) : (
        <div className="mt-8">
          <PresenceList rows={rows} todayLabel={todayLabel} turmas={turmas} />
        </div>
      )}
    </div>
  );
}
