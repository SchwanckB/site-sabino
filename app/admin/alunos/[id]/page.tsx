import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BeltDisplay } from '@/components/app/BeltDisplay';
import { weekdayLabels, type Weekday } from '@/data/seed';
import { countCheckins, listCheckins } from '@/lib/repositories/attendance';
import { listGraduationHistory } from '@/lib/repositories/graduation';
import { getPaymentPlan, listPaymentHistory } from '@/lib/repositories/payments';
import { getStudent, toPublicStudent } from '@/lib/repositories/students';
import { getSchedule } from '@/lib/schedule';
import { cn } from '@/lib/utils';
import {
  CHECKIN_SOURCE_LABELS,
  PAYMENT_METHOD_LABELS,
  STATUS_LABELS,
  type PaymentMethod,
} from '@/types/domain';
import { daysBetween, formatBr, saoPauloDateString } from '@/utils/datetime';
import { formatCents, getPaymentSummary, PLAN_LABELS } from '@/utils/paymentEngine';

import type { ClassOption } from '../../aprovacoes/ApprovalCard';
import { StudentEditor } from './StudentEditor';

export const metadata: Metadata = { title: 'Ficha do aluno' };
export const dynamic = 'force-dynamic';

export default async function AlunoPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const student = await getStudent(id);
  if (!student) notFound();

  const now = new Date();

  const [schedule, plan, checkins, total, graduations, payments] = await Promise.all([
    getSchedule(),
    getPaymentPlan(student.id),
    listCheckins(student.id, 120),
    countCheckins(student.id),
    listGraduationHistory(student.id, 20),
    listPaymentHistory(student.id, 12),
  ]);

  const publicStudent = toPublicStudent(student, now);
  const isKids = student.category === 'kids';
  const summary = plan ? getPaymentSummary(plan, now) : null;

  const today = saoPauloDateString(now);
  const last90 = checkins.filter((entry) => daysBetween(today, entry.date) < 90).length;

  const classOptions: ClassOption[] = schedule.classes.map((slot) => ({
    id: slot.id,
    label: `${slot.title} · ${slot.level}`,
    weekday: `${weekdayLabels[slot.weekday as Weekday]}, ${slot.startTime} às ${slot.endTime}`,
  }));

  return (
    <div>
      <nav aria-label="Trilha" className="text-sm text-muted">
        <Link href="/admin/alunos" className="hover:text-foreground">
          Alunos
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-foreground">{student.name}</span>
      </nav>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl leading-none sm:text-4xl">{student.name}</h1>
          <p className="mt-2 text-sm text-muted">
            {publicStudent.age} anos · {isKids ? 'Infantil' : 'Adulto'} ·{' '}
            {STATUS_LABELS[student.status]}
          </p>
        </div>
        <BeltDisplay
          belt={student.belt}
          degree={student.degree}
          isKids={isKids}
          className="max-w-[200px]"
        />
      </header>

      {/* Dados pessoais --------------------------------------------------- */}
      <section className="surface-card mt-8 p-5 sm:p-6">
        <h2 className="text-lg normal-case tracking-normal">Dados do cadastro</h2>

        <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">E-mail</dt>
            <dd className="mt-0.5 break-words text-foreground">{student.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Telefone</dt>
            <dd className="mt-0.5 text-foreground">{student.phone}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">CPF</dt>
            <dd className="mt-0.5 font-mono text-foreground">{publicStudent.cpfMasked}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Nascimento</dt>
            <dd className="mt-0.5 text-foreground">{formatBr(student.birthDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Matriculado em</dt>
            <dd className="mt-0.5 text-foreground">
              {student.joinedAt ? formatBr(student.joinedAt.slice(0, 10)) : '--'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Última graduação</dt>
            <dd className="mt-0.5 text-foreground">
              {student.lastGraduationAt ? formatBr(student.lastGraduationAt.slice(0, 10)) : '--'}
            </dd>
          </div>
          {student.guardianName ? (
            <>
              <div>
                <dt className="text-xs text-muted">Responsável</dt>
                <dd className="mt-0.5 text-foreground">{student.guardianName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Telefone do responsável</dt>
                <dd className="mt-0.5 text-foreground">{student.guardianPhone ?? '--'}</dd>
              </div>
            </>
          ) : null}
        </dl>

        {publicStudent.hasDocument ? (
          <a
            href={`/api/admin/documento/${student.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary mt-5"
          >
            Abrir documento
          </a>
        ) : (
          <p className="mt-5 text-xs text-crimson">Sem documento anexado.</p>
        )}
      </section>

      {/* Resumo rápido ----------------------------------------------------- */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="surface-card p-4">
          <p className="text-xs text-muted">Total de treinos</p>
          <p className="mt-1 font-display text-3xl leading-none tabular-nums text-crimson">
            {total}
          </p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs text-muted">Últimos 90 dias</p>
          <p className="mt-1 font-display text-3xl leading-none tabular-nums">{last90}</p>
        </div>
        <div
          className={cn(
            'rounded-2xl border p-4 backdrop-blur-md',
            summary?.status === 'vencida'
              ? 'border-crimson/40 bg-crimson/[.06]'
              : summary?.status === 'vence_em_breve'
                ? 'border-amber-500/30 bg-amber-500/[.05]'
                : 'border-hairline bg-white/[.04]',
          )}
        >
          <p className="text-xs text-muted">Mensalidade</p>
          {summary ? (
            <>
              <p className="mt-1 font-display text-xl leading-none">
                {formatCents(summary.amountCents)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {PLAN_LABELS[summary.planId]} · vence {formatBr(summary.dueDate)}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">Não definida</p>
          )}
        </div>
      </div>

      <div className="mt-6">
        <StudentEditor
          studentId={student.id}
          belt={student.belt}
          degree={student.degree}
          notes={student.notes}
          status={student.status}
          isKids={isKids}
          assignedClassIds={student.classIds}
          classOptions={classOptions}
        />
      </div>

      {/* Históricos --------------------------------------------------------- */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="surface-card p-5 sm:p-6">
          <h2 className="text-lg normal-case tracking-normal">Graduações</h2>
          {graduations.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nenhuma graduação registrada.</p>
          ) : (
            <ul className="mt-4 divide-y divide-hairline text-sm">
              {graduations.map((entry) => (
                <li key={entry.at} className="py-3">
                  <p className="text-foreground">
                    {entry.fromBelt === entry.toBelt
                      ? `Grau ${entry.toDegree}`
                      : `Faixa ${entry.toBelt}`}
                  </p>
                  <p className="text-xs text-muted">{formatBr(entry.at.slice(0, 10))}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="surface-card p-5 sm:p-6">
          <h2 className="text-lg normal-case tracking-normal">Pagamentos</h2>
          {payments.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nenhum pagamento registrado.</p>
          ) : (
            <ul className="mt-4 divide-y divide-hairline text-sm">
              {payments.map((entry) => (
                <li key={entry.paidAt} className="flex justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-foreground">{formatCents(entry.amountCents)}</p>
                    <p className="text-xs text-muted">
                      ref. {entry.referenceMonth} ·{' '}
                      {PAYMENT_METHOD_LABELS[entry.method as PaymentMethod] ?? entry.method}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {formatBr(entry.paidAt.slice(0, 10))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="surface-card p-5 sm:p-6">
          <h2 className="text-lg normal-case tracking-normal">Últimas presenças</h2>
          {checkins.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nenhuma presença registrada.</p>
          ) : (
            <ul className="mt-4 divide-y divide-hairline text-sm">
              {checkins.slice(0, 10).map((entry) => (
                <li key={entry.at} className="flex justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-foreground">{entry.classTitle ?? 'Treino'}</p>
                    <p className="text-xs text-muted">
                      {CHECKIN_SOURCE_LABELS[entry.source]}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {formatBr(entry.date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
