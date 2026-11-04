import type { Metadata } from 'next';

import { PageHeader } from '@/components/app/PageHeader';

import { weekdayLabels, type Weekday } from '@/data/seed';
import { requirePermission } from '@/lib/auth';
import { getPlans } from '@/lib/repositories/plansAdmin';
import { getSchedule } from '@/lib/schedule';
import { listStudentsByStatus, toPublicStudent } from '@/lib/repositories/students';
import { getUnitScope } from '@/lib/unitScope';
import { filterByUnit } from '@/types/domain';

import { ApprovalCard } from './ApprovalCard';
import { type ClassOption } from '../ClassPicker';

export const metadata: Metadata = { title: 'Aprovações' };
export const dynamic = 'force-dynamic';

export default async function AprovacoesPage() {
  await requirePermission('matricula');

  const now = new Date();
  const scope = await getUnitScope();

  /*
   * A fila tem dois grupos, e o segundo faltava.
   *
   * Recusar gravava `recusado` e o cadastro saía desta tela para sempre: o
   * único caminho de volta era achar o aluno na lista (que abre filtrada em
   * "ativo"), trocar a situação para pendente na ficha e voltar aqui. Ninguém
   * descobre isso sozinho. Quem foi recusado ou desativado agora aparece
   * abaixo, e `approveStudent` aceita qualquer situação de origem — aprovar
   * daqui já define turmas, faixa e mensalidade, como na primeira vez.
   */
  const [todosPendentes, recusados, inativos, schedule, planSet] = await Promise.all([
    listStudentsByStatus('pendente'),
    listStudentsByStatus('recusado'),
    listStudentsByStatus('inativo'),
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
    modality: slot.modality,
    teacher: slot.teacher ?? '',
  }));

  // Mais antigo primeiro: quem espera há mais tempo é atendido antes.
  const ordered = [...pending].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Recusado e inativo na mesma lista: dos dois a saída é a mesma, aprovar de
  // novo. Mais recente primeiro — a conversa de reativação é quase sempre
  // sobre quem saiu por último.
  const arquivados = filterByUnit([...recusados, ...inativos], scope).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

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

      {arquivados.length > 0 ? (
        <section className="border-t border-hairline pt-6">
          <h2 className="font-display text-lg uppercase tracking-tight">
            Recusados e desativados
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Quem você recusou ou desativou fica aqui, e pode ser aceito a qualquer momento.
            Aprovar daqui define turmas, faixa e mensalidade de novo, como numa matrícula nova
            — o histórico de presenças e graduações continua o mesmo.
          </p>

          {/*
            Fechado por padrão: esta lista só cresce com o tempo e não é o que
            o professor vem fazer nesta tela. `details` resolve sem JavaScript.
          */}
          <details className="mt-4 group">
            <summary className="btn-secondary inline-flex cursor-pointer list-none">
              Ver {arquivados.length}{' '}
              {arquivados.length === 1 ? 'cadastro arquivado' : 'cadastros arquivados'}
            </summary>

            <ul className="mt-4 space-y-5">
              {arquivados.map((student) => (
                <ApprovalCard
                  key={student.id}
                  student={toPublicStudent(student, now)}
                  classOptions={classOptions}
                  planNames={planNames}
                />
              ))}
            </ul>
          </details>
        </section>
      ) : null}
    </div>
  );
}
