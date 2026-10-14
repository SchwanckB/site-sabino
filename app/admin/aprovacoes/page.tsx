import type { Metadata } from 'next';

import { weekdayLabels, type Weekday } from '@/data/seed';
import { getSchedule } from '@/lib/schedule';
import { listStudentsByStatus, toPublicStudent } from '@/lib/repositories/students';

import { ApprovalCard, type ClassOption } from './ApprovalCard';

export const metadata: Metadata = { title: 'Aprovações' };
export const dynamic = 'force-dynamic';

export default async function AprovacoesPage() {
  const now = new Date();
  const [pending, schedule] = await Promise.all([
    listStudentsByStatus('pendente'),
    getSchedule(),
  ]);

  const classOptions: ClassOption[] = schedule.classes.map((slot) => ({
    id: slot.id,
    label: `${slot.title} · ${slot.level}`,
    weekday: `${weekdayLabels[slot.weekday as Weekday]}, ${slot.startTime} às ${slot.endTime}`,
  }));

  // Mais antigo primeiro: quem espera há mais tempo é atendido antes.
  const ordered = [...pending].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Fila de aprovação</p>
          <h1 className="mt-2 text-3xl leading-none sm:text-4xl">Aprovações</h1>
        </div>
        <p aria-live="polite" className="surface-card px-4 py-3 text-sm text-muted">
          <span className="font-display text-2xl leading-none text-crimson tabular-nums">
            {ordered.length}
          </span>{' '}
          {ordered.length === 1 ? 'cadastro aguardando' : 'cadastros aguardando'}
        </p>
      </header>

      {ordered.length === 0 ? (
        <div className="surface-card mt-8 px-6 py-16 text-center">
          <p className="font-display text-lg uppercase tracking-tight">
            Nenhum cadastro na fila
          </p>
          <p className="mt-2 text-sm text-muted">
            Quando alguém enviar o pré-cadastro pelo site, ele aparece aqui.
          </p>
        </div>
      ) : (
        <ul className="mt-8 space-y-5">
          {ordered.map((student) => (
            <ApprovalCard
              key={student.id}
              student={toPublicStudent(student, now)}
              classOptions={classOptions}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
