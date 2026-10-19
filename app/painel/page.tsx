import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { BeltDisplay } from '@/components/app/BeltDisplay';
import { weekdayLabels, type Weekday } from '@/data/seed';
import { getSessionUser } from '@/lib/auth';
import { countCheckins, hasCheckedInToday, listCheckins } from '@/lib/repositories/attendance';
import { listGraduationHistory } from '@/lib/repositories/graduation';
import { getPaymentPlan } from '@/lib/repositories/payments';
import { getStudent } from '@/lib/repositories/students';
import { getSchedule } from '@/lib/schedule';
import { cn } from '@/lib/utils';
import { CHECKIN_SOURCE_LABELS, beltLabel } from '@/types/domain';
import {
  findNextClass,
  formatMinutes,
  groupAssignedByWeekday,
} from '@/utils/attendanceEngine';
import { daysBetween, formatBr, saoPauloDateString, saoPauloParts } from '@/utils/datetime';
import { occurrencesInMonth } from '@/utils/classReport';
import { getDegreeColor } from '@/utils/graduationEngine';
import { formatCents, getPaymentSummary, PLAN_LABELS } from '@/utils/paymentEngine';

export const metadata: Metadata = { title: 'Meu painel' };
export const dynamic = 'force-dynamic';

const STATUS_STYLES = {
  em_dia: { label: 'Em dia', className: 'border-emerald-500/40 bg-emerald-500/[.08] text-emerald-300' },
  vence_em_breve: { label: 'Vence em breve', className: 'border-amber-500/40 bg-amber-500/[.08] text-amber-300' },
  vencida: { label: 'Vencida', className: 'border-crimson/50 bg-crimson/[.08] text-crimson' },
} as const;

export default async function PainelPage() {
  const user = await getSessionUser();
  if (!user) redirect('/entrar');

  const student = await getStudent(user.id);
  if (!student) redirect('/onboarding');

  const now = new Date();

  const [schedule, plan, checkins, total, checkedInToday, graduations] = await Promise.all([
    getSchedule(),
    getPaymentPlan(student.id),
    listCheckins(student.id, 120),
    countCheckins(student.id),
    hasCheckedInToday(student.id, now),
    listGraduationHistory(student.id, 5),
  ]);

  const isKids = student.category === 'kids';
  const nextClass = findNextClass(schedule.classes, student.classIds, now);
  const myDays = groupAssignedByWeekday(schedule.classes, student.classIds);

  const today = saoPauloDateString(now);
  const last90 = checkins.filter((entry) => daysBetween(today, entry.date) < 90).length;
  const thisMonth = checkins.filter((entry) => entry.date.startsWith(today.slice(0, 7))).length;

  // Meta do mês: quantas vezes as turmas do aluno acontecem no mês corrente.
  // Não é número inventado — é a grade dele. "8 de 12" diz mais do que "8".
  const { year, month } = saoPauloParts(now);
  const aulasNoMes = schedule.classes
    .filter((slot) => student.classIds.includes(slot.id))
    .reduce(
      (soma, slot) => soma + occurrencesInMonth(slot.weekday, year, month),
      0,
    );

  const payment = plan ? getPaymentSummary(plan, now) : null;
  // Vence em até três dias: merece destaque, não uma linha no meio da ficha.
  const diasAteVencer = payment ? daysBetween(payment.dueDate, today) : null;
  const avisoMensalidade =
    payment !== null &&
    (payment.status === 'vencida' ||
      (diasAteVencer !== null && diasAteVencer >= 0 && diasAteVencer <= 3));
  const paymentStyle = payment ? STATUS_STYLES[payment.status] : null;

  const nextDegreeColor = isKids ? getDegreeColor(student.degree + 1) : null;

  return (
    <div className="space-y-3">
      <header>
        <p className="eyebrow">Olá, {student.name.split(' ')[0]}</p>
        <h1 className="mt-2 text-3xl leading-none sm:text-4xl">Meu painel</h1>
      </header>

      {/*
        Mensalidade perto do vencimento sobe para o topo. No meio da ficha o
        aluno só a vê quando já está atrasada — e aí a conversa é outra.
      */}
      {avisoMensalidade && payment ? (
        <div
          role="status"
          className={cn(
            'flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4',
            payment.status === 'vencida'
              ? 'border-crimson/45 bg-crimson/[.09]'
              : 'border-amber-500/40 bg-amber-500/[.07]',
          )}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {payment.status === 'vencida'
                ? `Mensalidade vencida em ${formatBr(payment.dueDate)}`
                : diasAteVencer === 0
                  ? 'Sua mensalidade vence hoje'
                  : `Sua mensalidade vence em ${diasAteVencer} ${diasAteVencer === 1 ? 'dia' : 'dias'}`}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {formatCents(payment.amountCents)} · pode pagar até {formatBr(payment.limitDate)}
            </p>
          </div>
          <Link href="#mensalidade" className="btn-secondary shrink-0 text-xs">
            Ver detalhes
          </Link>
        </div>
      ) : null}

      {/* Check-in em destaque: é a ação do dia. ------------------------- */}
      <section
        className={cn(
          'panel panel-pad flex flex-wrap items-center justify-between gap-4',
          checkedInToday && 'border-emerald-500/30 bg-emerald-500/[.05]',
        )}
      >
        <div className="min-w-0">
          <h2 className="panel-title">
            {checkedInToday ? 'Presença registrada hoje' : 'Registrar presença'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {checkedInToday
              ? 'Bom treino! Volte amanhã para o próximo check-in.'
              : 'Leia o QR Code da recepção quando chegar no tatame.'}
          </p>
        </div>
        {!checkedInToday ? (
          <Link href="/painel/checkin" className="btn-primary shrink-0">
            Fazer check-in
          </Link>
        ) : null}
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* Graduação ---------------------------------------------------- */}
        <section className="panel panel-pad lg:col-span-2">
          <h2 className="panel-title">Sua graduação</h2>

          <div className="mt-3 flex items-center gap-4 sm:gap-6">
            <BeltDisplay
              belt={student.belt}
              degree={student.degree}
              isKids={isKids}
              className="w-[38%] max-w-[160px] shrink-0 sm:w-auto sm:max-w-[220px]"
            />
            <div className="min-w-0">
              <p className="font-display text-xl uppercase leading-tight tracking-tight sm:text-2xl">
                {beltLabel(student.belt)}
              </p>
              <p className="mt-1 text-sm text-muted">
                {student.degree} {student.degree === 1 ? 'grau' : 'graus'}
                {isKids ? ' de 12' : ''}
              </p>
              {nextDegreeColor ? (
                <p className="mt-2 text-xs text-muted">
                  Próximo grau: tarja {nextDegreeColor}
                </p>
              ) : null}
            </div>
          </div>

          <dl className="mt-4 grid gap-3 border-t border-hairline pt-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted">Matriculado em</dt>
              <dd className="mt-1 text-foreground">
                {student.joinedAt ? formatBr(student.joinedAt.slice(0, 10)) : '--'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Última graduação</dt>
              <dd className="mt-1 text-foreground">
                {student.lastGraduationAt
                  ? formatBr(student.lastGraduationAt.slice(0, 10))
                  : 'Ainda não graduou'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Graduações registradas</dt>
              <dd className="mt-1 tabular-nums text-foreground">{graduations.length}</dd>
            </div>
          </dl>
        </section>

        {/* Mensalidade -------------------------------------------------- */}
        <section
          id="mensalidade"
          // Alvo do atalho na barra inferior; a margem evita que o cabeçalho
          // fixo cubra o título ao pular para cá.
          style={{ scrollMarginTop: 80 }}
          className={cn(
            'rounded-2xl border p-5 backdrop-blur-md sm:p-6',
            paymentStyle ? paymentStyle.className : 'border-hairline bg-white/[.04]',
          )}
        >
          <h2 className="panel-title">Mensalidade</h2>

          {payment && plan ? (
            <>
              <p className="mt-4 font-display text-3xl leading-none text-foreground">
                {formatCents(payment.amountCents)}
              </p>
              <p className="mt-1 text-sm">{paymentStyle?.label}</p>

              <dl className="mt-5 space-y-2 border-t border-white/10 pt-4 text-sm text-foreground">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Plano</dt>
                  <dd>{PLAN_LABELS[payment.planId]}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Vencimento</dt>
                  <dd className="tabular-nums">{formatBr(payment.dueDate)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Paga até</dt>
                  <dd className="tabular-nums">{formatBr(payment.limitDate)}</dd>
                </div>
                {payment.openInstallments > 1 ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Parcelas em aberto</dt>
                    <dd className="tabular-nums">{payment.openInstallments}</dd>
                  </div>
                ) : null}
              </dl>

              <p className="mt-4 text-xs leading-relaxed text-muted">
                Pague por Pix e mande o comprovante no WhatsApp da academia. A recepção dá baixa
                no sistema.
              </p>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">
              A academia ainda não registrou sua mensalidade. Fale com a recepção.
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* Próxima aula ------------------------------------------------- */}
        <section className="panel panel-pad">
          <h2 className="panel-title">Próxima aula</h2>

          {nextClass ? (
            <>
              <p className="mt-4 font-display text-2xl uppercase leading-tight tracking-tight">
                {nextClass.title}
              </p>
              <p className="mt-1 text-sm text-muted">{nextClass.level}</p>
              <p className="mt-4 text-sm text-foreground">
                {nextClass.daysUntil === 0
                  ? 'Hoje'
                  : nextClass.daysUntil === 1
                    ? 'Amanhã'
                    : weekdayLabels[nextClass.weekday as Weekday]}{' '}
                às {nextClass.startTime}
              </p>
              {nextClass.minutesUntilStart > 0 ? (
                <p className="mt-1 text-xs text-muted">
                  Começa em {formatMinutes(nextClass.minutesUntilStart)}
                </p>
              ) : (
                <p className="mt-1 text-xs text-emerald-300">Acontecendo agora</p>
              )}
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">
              Nenhuma turma atribuída ainda. A recepção define suas aulas na matrícula.
            </p>
          )}
        </section>

        {/* Frequência --------------------------------------------------- */}
        <section
          id="frequencia"
          style={{ scrollMarginTop: 80 }}
          className="panel panel-pad"
        >
          <h2 className="panel-title">Sua frequência</h2>

          <dl className="mt-5 space-y-4">
            <div>
              <dt className="text-xs text-muted">Total de treinos</dt>
              <dd className="font-display text-3xl leading-none tabular-nums text-crimson">
                {total}
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-hairline pt-4">
              <div>
                <dt className="text-xs text-muted">Este mês</dt>
                <dd className="mt-1 font-display text-xl tabular-nums">
                  {thisMonth}
                  {aulasNoMes > 0 ? (
                    <span className="text-base text-muted">/{aulasNoMes}</span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Últimos 90 dias</dt>
                <dd className="mt-1 font-display text-xl tabular-nums">{last90}</dd>
              </div>
            </div>
          </dl>
        </section>

        {/* Minhas aulas ------------------------------------------------- */}
        <section className="panel panel-pad">
          <h2 className="panel-title">Minhas aulas</h2>

          {myDays.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Nenhuma turma atribuída.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {myDays.map(({ weekday, classes }) => (
                <li key={weekday}>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted">
                    {weekdayLabels[weekday as Weekday]}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {classes.map((slot) => (
                      <li key={slot.id} className="flex items-baseline gap-2 text-sm">
                        <span className="font-display tabular-nums text-foreground">
                          {slot.startTime}
                        </span>
                        <span className="min-w-0 truncate text-muted">{slot.title}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Últimos treinos ------------------------------------------------ */}
      <section className="panel panel-pad">
        <h2 className="panel-title">Últimos treinos</h2>

        {checkins.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            Nenhuma presença registrada ainda. O primeiro check-in aparece aqui.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-hairline">
            {checkins.slice(0, 10).map((entry) => (
              <li key={entry.at} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{entry.classTitle ?? 'Treino'}</p>
                  <p className="text-xs text-muted">
                    {formatBr(entry.date)} às {entry.at.slice(11, 16)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-hairline px-2.5 py-1 text-[11px] text-muted">
                  {CHECKIN_SOURCE_LABELS[entry.source]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
