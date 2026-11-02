import type { Metadata } from 'next';

import { PageHeader } from '@/components/app/PageHeader';

import { weekdayLabels, type Weekday } from '@/data/seed';
import { getPlans } from '@/lib/repositories/plansAdmin';
import { getSchedule } from '@/lib/schedule';
import { listStudentsByStatus, toPublicStudent } from '@/lib/repositories/students';
import { getUnitScope } from '@/lib/unitScope';
import { filterByUnit } from '@/types/domain';

import { ApprovalCard, type ClassOption } from './ApprovalCard';

export const metadata: Metadata = { title: 'Aprovações' };
export const dynamic = 'force-dynamic';

export default async function AprovacoesPage() {
  const now = new Date();
  const scope = await getUnitScope();

  const [todosPendentes, schedule, planSet] = await Promise.all([
    listStudentsByStatus('pendente'),
    getSchedule(),
    getPlans(),
  ]);

  // Os nomes dos planos da vitrine alimentam o seletor da mensalidade: o
  // professor marca o que o aluno contratou em vez de digitar de cabeça.
  const planNames = planSet.plans.map((plan) => plan.name);

  const pending = filterByUnit(todosPendentes, scope);

  const classOptions: ClassOption[] = schedule.classes.map((slot) => ({
    id: slot.id,
    label: `${slot.title} · ${slot.level}`,
    weekday: `${weekdayLabels[slot.weekday as Weekday]}, ${slot.startTime} às ${slot.endTime}`,
    unit: slot.unit,
  }));

  // Mais antigo primeiro: quem espera há mais tempo é atendido antes.
  const ordered = [...pending].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="page-stack">
      <PageHeader
        title="Aprovações"
      />

      {ordered.length === 0 ? (
        <div className="panel px-6 py-16 text-center">
          <p className="font-display text-lg uppercase tracking-tight">
            Nenhum cadastro na fila
          </p>
          <p className="mt-2 text-sm text-muted">
            Quando alguém enviar o pré-cadastro pelo site, ele aparece aqui.
          </p>
        </div>
      ) : (
        <ul className="space-y-5">
          {ordered.map((student) => (
            <ApprovalCard
              key={student.id}
              student={toPublicStudent(student, now)}
              classOptions={classOptions}
              planNames={planNames}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
