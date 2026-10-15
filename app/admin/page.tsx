import type { Metadata } from 'next';
import Link from 'next/link';

import { getTodayCheckins, listCheckins } from '@/lib/repositories/attendance';
import { getPaymentPlans } from '@/lib/repositories/payments';
import {
  countByStatus,
  listGraduationDueIds,
  listStudentsByStatus,
} from '@/lib/repositories/students';
import { getSchedule } from '@/lib/schedule';
import { findOpenClasses } from '@/utils/attendanceEngine';
import { daysBetween, saoPauloDateString } from '@/utils/datetime';
import { getPaymentSummary } from '@/utils/paymentEngine';

import { Dashboards, type DashboardRow } from './Dashboards';

export const metadata: Metadata = { title: 'Visão geral' };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const now = new Date();
  const hoje = saoPauloDateString(now);

  const [counts, active, schedule, dueIds] = await Promise.all([
    countByStatus(),
    listStudentsByStatus('ativo'),
    getSchedule(),
    listGraduationDueIds(now),
  ]);

  const ids = active.map((student) => student.id);
  const [plans, checkinsHoje] = await Promise.all([
    getPaymentPlans(ids),
    getTodayCheckins(ids, now),
  ]);

  // Histórico por aluno: alimenta frequência e o alerta de evasão.
  const historicos = await Promise.all(
    active.map(async (student) => ({
      id: student.id,
      entries: await listCheckins(student.id, 200),
    })),
  );
  const porAluno = new Map(historicos.map((h) => [h.id, h.entries]));

  const rows: DashboardRow[] = active.map((student) => {
    const plan = plans.get(student.id);
    const summary = plan ? getPaymentSummary(plan, now) : null;
    const entries = porAluno.get(student.id) ?? [];

    const checkins30 = entries.filter((e) => daysBetween(hoje, e.date) < 30).length;
    const ultimo = entries[0]?.date ?? null;

    return {
      id: student.id,
      name: student.name,
      category: student.category,
      gender: student.gender,
      belt: student.belt,
      paymentStatus: summary?.status ?? null,
      openCents: summary?.totalOpenCents ?? 0,
      dueDate: summary?.dueDate ?? '',
      checkins30,
      checkinsTotal: entries.length,
      lastCheckinAt: ultimo,
      daysSinceLastCheckin: ultimo ? daysBetween(hoje, ultimo) : null,
    };
  });

  const inClassNow = active.filter(
    (student) => findOpenClasses(schedule.classes, student.classIds, now).length > 0,
  );
  const presentNow = inClassNow.filter((student) => checkinsHoje.has(student.id)).length;

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Painel do admin</p>
          <h1 className="mt-2 text-3xl leading-none sm:text-4xl">Visão geral</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          {counts.pendente > 0 ? (
            <Link href="/admin/aprovacoes" className="btn-primary text-sm">
              {counts.pendente} {counts.pendente === 1 ? 'cadastro aguardando' : 'cadastros aguardando'}
            </Link>
          ) : null}
          {dueIds.length > 0 ? (
            <Link href="/admin/graduacao" className="btn-secondary text-sm">
              {dueIds.length} {dueIds.length === 1 ? 'grau liberado' : 'graus liberados'}
            </Link>
          ) : null}
        </div>
      </header>

      {/* Agora no tatame -------------------------------------------------- */}
      <section className="surface-card mt-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg normal-case tracking-normal">Agora no tatame</h2>
            <p className="mt-1 text-sm text-muted">
              {inClassNow.length === 0
                ? 'Nenhuma turma na janela de check-in neste horário.'
                : `${presentNow} de ${inClassNow.length} alunos já registraram presença.`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/admin/presenca" className="btn-primary text-sm">
              Fazer a chamada
            </Link>
            <Link href="/admin/qr" className="btn-secondary text-sm">
              Abrir QR
            </Link>
          </div>
        </div>

        {inClassNow.length > 0 ? (
          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-white/[.07]"
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

      {active.length === 0 ? (
        <div className="surface-card mt-6 px-6 py-16 text-center">
          <p className="font-display text-lg uppercase tracking-tight">Nenhum aluno ativo ainda</p>
          <p className="mt-2 text-sm text-muted">
            Aprove os cadastros em Aprovações e os indicadores aparecem aqui.
          </p>
        </div>
      ) : (
        <div className="mt-8">
          <Dashboards rows={rows} />
        </div>
      )}
    </div>
  );
}
