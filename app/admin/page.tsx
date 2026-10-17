import type { Metadata } from 'next';
import Link from 'next/link';

import { getTodayCheckins, listCheckins } from '@/lib/repositories/attendance';
import { getPaymentPlans } from '@/lib/repositories/payments';
import {
  listGraduationDueIds,
  listStudentsByStatus,
} from '@/lib/repositories/students';
import { getSchedule } from '@/lib/schedule';
import { getUnitScope } from '@/lib/unitScope';
import { STATUS_LABELS, UNIT_SHORT, filterByUnit } from '@/types/domain';
import { findOpenClasses } from '@/utils/attendanceEngine';
import { daysBetween, saoPauloDateString, saoPauloParts } from '@/utils/datetime';
import { getPaymentSummary } from '@/utils/paymentEngine';
import { listAgeTransitions, listBirthdays, type PersonLike } from '@/utils/roster';
import { buildHaystack } from '@/utils/searchText';

import { PageHeader } from '@/components/app/PageHeader';
import { QuickSearch, type SearchEntry } from '@/components/app/QuickSearch';

import { Alertas } from './Alertas';
import { Dashboards, type DashboardRow } from './Dashboards';

export const metadata: Metadata = { title: 'Visão geral' };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const now = new Date();
  const hoje = saoPauloDateString(now);

  const scope = await getUnitScope();

  const [pendentes, todosAtivos, schedule, dueIds] = await Promise.all([
    listStudentsByStatus('pendente'),
    listStudentsByStatus('ativo'),
    getSchedule(),
    listGraduationDueIds(now),
  ]);

  const active = filterByUnit(todosAtivos, scope);
  // O aviso de cadastro aguardando leva para uma tela já filtrada: contar a
  // rede inteira aqui mandaria o professor para uma lista vazia.
  const aguardando = filterByUnit(pendentes, scope).length;
  const classes = filterByUnit(schedule.classes, scope);

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

  // Avisos derivados da data de nascimento: aniversário do mês e os 16 anos.
  const comNascimento: PersonLike[] = active
    .filter((student) => student.birthDate.length > 0)
    .map((student) => ({ id: student.id, name: student.name, birthDate: student.birthDate }));

  const { year, month } = saoPauloParts(now);
  const birthdays = listBirthdays(comNascimento, year, month, now);
  const transitions = listAgeTransitions(
    comNascimento.filter((p) => active.find((s) => s.id === p.id)?.category === 'kids'),
    now,
  );

  // Busca única: nome e telefone normalizados no servidor, para o filtro no
  // cliente não refazer isso a cada tecla.
  const buscaveis: SearchEntry[] = todosAtivos
    .concat(pendentes)
    .map((student) => ({
      id: student.id,
      name: student.name,
      detail: [
        UNIT_SHORT[student.unit],
        student.belt,
        student.status === 'ativo' ? null : STATUS_LABELS[student.status],
        student.guardianPhone ?? student.phone,
      ]
        .filter(Boolean)
        .join(' · '),
      haystack: buildHaystack([
        student.name,
        student.phone,
        student.guardianPhone,
        student.email,
      ]),
    }));

  const inClassNow = active.filter(
    (student) => findOpenClasses(classes, student.classIds, now).length > 0,
  );
  const presentNow = inClassNow.filter((student) => checkinsHoje.has(student.id)).length;

  return (
    <div>
      <PageHeader
        title="Visão geral"
        actions={
          <>
            {aguardando > 0 ? (
              <Link href="/admin/aprovacoes" className="btn-primary text-sm">
                {aguardando} {aguardando === 1 ? 'cadastro aguardando' : 'cadastros aguardando'}
              </Link>
            ) : null}
            {dueIds.length > 0 ? (
              <Link href="/admin/graduacao" className="btn-secondary text-sm">
                {dueIds.length} {dueIds.length === 1 ? 'grau liberado' : 'graus liberados'}
              </Link>
            ) : null}
          </>
        }
      />

      <div className="mt-5">
        <QuickSearch entries={buscaveis} />
      </div>

      {/*
        A aula de agora é a única coisa desta tela com hora marcada; por isso
        tem destaque próprio, e não mais um cartão igual aos outros.
      */}
      <section className="panel panel-pad mt-4">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="panel-title">Agora no tatame</p>
            <p className="mt-1.5 text-sm text-foreground">
              {inClassNow.length === 0
                ? 'Nenhuma turma na janela de check-in.'
                : (
                  <>
                    <span className="font-display text-xl tabular-nums text-crimson">
                      {presentNow}
                    </span>
                    <span className="text-muted"> de {inClassNow.length} já marcaram presença</span>
                  </>
                )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/admin/aula" className="btn-primary text-sm">
              Abrir a aula
            </Link>
            <Link href="/admin/qr" className="btn-secondary text-sm">
              QR da recepção
            </Link>
          </div>
        </div>

        {inClassNow.length > 0 ? (
          <div
            className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-white/[.07]"
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

      <Alertas birthdays={birthdays} transitions={transitions} />

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
