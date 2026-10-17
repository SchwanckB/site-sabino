import type { Metadata } from 'next';
import Link from 'next/link';

import { getTodayCheckins } from '@/lib/repositories/attendance';
import { listStudentsByStatus } from '@/lib/repositories/students';
import { getUnitScope } from '@/lib/unitScope';
import { filterByUnit } from '@/types/domain';
import { getSchedule } from '@/lib/schedule';
import { findOpenClasses } from '@/utils/attendanceEngine';
import { saoPauloParts } from '@/utils/datetime';

import { PresenceList, type PresenceRow } from './PresenceList';

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
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const { day, month, year } = saoPauloParts(now);
  const todayLabel = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Chamada</p>
          <h1 className="mt-2 text-3xl leading-none sm:text-4xl">Presença</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Marque um aluno por vez ou selecione vários e registre em lote. O aluno também pode
            registrar sozinho lendo o{' '}
            <Link href="/admin/qr" className="text-crimson underline-offset-4 hover:underline">
              QR Code da recepção
            </Link>
            .
          </p>
        </div>
      </header>

      {students.length === 0 ? (
        <div className="surface-card mt-8 px-6 py-16 text-center">
          <p className="font-display text-lg uppercase tracking-tight">Nenhum aluno ativo</p>
          <p className="mt-2 text-sm text-muted">
            Aprove os cadastros em Aprovações para que eles apareçam na chamada.
          </p>
        </div>
      ) : (
        <div className="mt-8">
          <PresenceList rows={rows} todayLabel={todayLabel} />
        </div>
      )}
    </div>
  );
}
