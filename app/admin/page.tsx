import type { Metadata } from 'next';
import Link from 'next/link';

import { getTodayCheckins } from '@/lib/repositories/attendance';
import { getPaymentPlans } from '@/lib/repositories/payments';
import {
  countByStatus,
  listGraduationDueIds,
  listStudentsByStatus,
} from '@/lib/repositories/students';
import { getSchedule } from '@/lib/schedule';
import { cn } from '@/lib/utils';
import { findOpenClasses } from '@/utils/attendanceEngine';
import { formatCents, getPaymentSummary } from '@/utils/paymentEngine';

export const metadata: Metadata = { title: 'Visão geral' };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const now = new Date();

  const [counts, active, schedule, dueIds] = await Promise.all([
    countByStatus(),
    listStudentsByStatus('ativo'),
    getSchedule(),
    listGraduationDueIds(now),
  ]);

  const ids = active.map((student) => student.id);
  const [plans, checkins] = await Promise.all([
    getPaymentPlans(ids),
    getTodayCheckins(ids, now),
  ]);

  const overdue = [...plans.values()].filter(
    (plan) => getPaymentSummary(plan, now).status === 'vencida',
  );
  const totalOpen = overdue.reduce(
    (sum, plan) => sum + getPaymentSummary(plan, now).totalOpenCents,
    0,
  );

  const inClassNow = active.filter(
    (student) => findOpenClasses(schedule.classes, student.classIds, now).length > 0,
  );
  const presentNow = inClassNow.filter((student) => checkins.has(student.id)).length;

  const cards = [
    {
      href: '/admin/aprovacoes',
      label: 'Cadastros aguardando',
      value: String(counts.pendente),
      accent: counts.pendente > 0,
    },
    {
      href: '/admin/financeiro',
      label: 'Mensalidades vencidas',
      value: String(overdue.length),
      hint: totalOpen > 0 ? `${formatCents(totalOpen)} em aberto` : undefined,
      accent: overdue.length > 0,
    },
    {
      href: '/admin/graduacao',
      label: 'Elegíveis a grau',
      value: String(dueIds.length),
      accent: false,
    },
    {
      href: '/admin/alunos',
      label: 'Alunos ativos',
      value: String(counts.ativo),
      accent: false,
    },
  ];

  return (
    <div>
      <header>
        <p className="eyebrow">Painel do admin</p>
        <h1 className="mt-2 text-3xl leading-none sm:text-4xl">Visão geral</h1>
      </header>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <li key={card.href}>
            <Link
              href={card.href}
              className={cn(
                'block rounded-2xl border p-5 backdrop-blur-md transition-colors',
                card.accent
                  ? 'border-crimson/40 bg-crimson/[.07] hover:border-crimson/60'
                  : 'border-hairline bg-white/[.04] hover:border-white/20',
              )}
            >
              <p className="text-xs text-muted">{card.label}</p>
              <p
                className={cn(
                  'mt-2 font-display text-4xl leading-none tabular-nums',
                  card.accent ? 'text-crimson' : 'text-foreground',
                )}
              >
                {card.value}
              </p>
              {card.hint ? <p className="mt-1 text-xs text-muted">{card.hint}</p> : null}
            </Link>
          </li>
        ))}
      </ul>

      <section className="surface-card mt-8 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg normal-case tracking-normal">Agora no tatame</h2>
            <p className="mt-1 text-sm text-muted">
              {inClassNow.length === 0
                ? 'Nenhuma turma na janela de check-in neste horário.'
                : `${presentNow} de ${inClassNow.length} alunos já registraram presença.`}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/admin/presenca" className="btn-primary">
              Fazer a chamada
            </Link>
            <Link href="/admin/qr" className="btn-secondary">
              Abrir QR
            </Link>
          </div>
        </div>

        {inClassNow.length > 0 ? (
          <div
            className="mt-5 h-2 overflow-hidden rounded-full bg-white/[.07]"
            role="progressbar"
            aria-valuenow={presentNow}
            aria-valuemin={0}
            aria-valuemax={inClassNow.length}
            aria-label="Presenças registradas na aula atual"
          >
            <div
              className="h-full rounded-full bg-crimson transition-all"
              style={{ width: `${(presentNow / inClassNow.length) * 100}%` }}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
