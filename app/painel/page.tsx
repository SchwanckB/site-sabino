import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { BeltDisplay } from '@/components/app/BeltDisplay';
import { Stat, StatStrip } from '@/components/app/PageHeader';
import { weekdayLabels, type Weekday } from '@/data/seed';
import { getSessionUser } from '@/lib/auth';
import { countCheckins, getTodayCheckins, listCheckins } from '@/lib/repositories/attendance';
import { listGraduationHistory } from '@/lib/repositories/graduation';
import { getPaymentPlan } from '@/lib/repositories/payments';
import { getStudent } from '@/lib/repositories/students';
import { getEffectiveSchedule } from '@/lib/schedule';
import { cn } from '@/lib/utils';
import { CHECKIN_SOURCE_LABELS, beltLabel } from '@/types/domain';
import {
  findNextClass,
  findOpenClasses,
  formatMinutes,
  groupAssignedByWeekday,
} from '@/utils/attendanceEngine';
import { canceledOn, recurringOnly } from '@/utils/classOverrides';
import {
  daysBetween,
  formatBr,
  saoPauloDateString,
  saoPauloParts,
  saoPauloTimeString,
} from '@/utils/datetime';
import { occurrencesInMonth } from '@/utils/classReport';
import { KIDS_TOTAL_DEGREES, getDegreeColor } from '@/utils/graduationEngine';
import { formatCents, getPaymentSummary, PLAN_LABELS } from '@/utils/paymentEngine';

export const metadata: Metadata = { title: 'Meu painel' };
export const dynamic = 'force-dynamic';

/**
 * Situação da mensalidade na linguagem do semáforo do painel.
 *
 * A cor saiu daqui para `globals.css`: as três situações têm as mesmas três
 * cores em toda a aplicação, e cada tela mantendo a sua cópia era o caminho
 * mais curto para "vencida" ser vermelha aqui e âmbar no financeiro.
 */
const STATUS_STYLES = {
  em_dia: { label: 'Em dia', badge: 'badge-ok' },
  vence_em_breve: { label: 'Vence em breve', badge: 'badge-warn' },
  vencida: { label: 'Vencida', badge: 'badge-late' },
} as const;

export default async function PainelPage() {
  const user = await getSessionUser();
  if (!user) redirect('/entrar');

  const student = await getStudent(user.id);
  if (!student) redirect('/onboarding');

  const now = new Date();

  const [schedule, plan, checkins, total, hojeMap, graduations] = await Promise.all([
    getEffectiveSchedule(now),
    getPaymentPlan(student.id),
    listCheckins(student.id, 120),
    countCheckins(student.id),
    getTodayCheckins([student.id], now),
    listGraduationHistory(student.id, 5),
  ]);

  const isKids = student.category === 'kids';
  const nextClass = findNextClass(schedule.classes, student.classIds, now);
  const myDays = groupAssignedByWeekday(schedule.classes, student.classIds);

  /*
   * As presenças de hoje — no plural, desde que presença é por aula realizada.
   *
   * Quem treina a das 19:30 e fica para a das 20:30 marca duas vezes. Antes o
   * painel perguntava só "já bateu hoje?" e, tendo batido, escondia o botão de
   * check-in até o dia seguinte — o segundo treino do dia ficava sem registro
   * e o aluno não tinha como reclamar, porque a tela dizia "presença
   * registrada".
   */
  const presencasHoje = hojeMap.get(student.id) ?? [];
  const checkedInToday = presencasHoje.length > 0;
  const marcadas = new Set(presencasHoje.map((entry) => entry.classId));

  // Aulas abertas agora em que ele ainda não bateu: é isso que decide se o
  // botão de check-in aparece, não o fato de já ter vindo hoje.
  const faltaMarcar = findOpenClasses(schedule.classes, student.classIds, now).filter(
    (slot) => !marcadas.has(slot.classId),
  );

  const today = saoPauloDateString(now);
  const canceladasHoje = canceledOn(schedule.classes, student.classIds, today);
  const last90 = checkins.filter((entry) => daysBetween(today, entry.date) < 90).length;
  const thisMonth = checkins.filter((entry) => entry.date.startsWith(today.slice(0, 7))).length;

  // Meta do mês: quantas vezes as turmas do aluno acontecem no mês corrente.
  // Não é número inventado — é a grade dele. "8 de 12" diz mais do que "8".
  //
  // Conta só as turmas recorrentes: uma aula personalizada é a mesma turma em
  // outro horário, não um treino a mais no mês.
  const { year, month } = saoPauloParts(now);
  const aulasNoMes = recurringOnly(schedule.classes)
    .filter((slot) => student.classIds.includes(slot.id))
    .reduce(
      (soma, slot) => soma + occurrencesInMonth(slot.weekday, year, month),
      0,
    );

  const payment = plan ? getPaymentSummary(plan, now) : null;
  // Vence em até três dias: merece destaque, não uma linha no meio da ficha.
  const diasAteVencer = payment ? daysBetween(payment.dueDate, today) : null;
  const paymentStyle = payment ? STATUS_STYLES[payment.status] : null;

  const nextDegreeColor = isKids ? getDegreeColor(student.degree + 1) : null;

  /*
   * Avisos do dia, num lugar só e em ordem de urgência.
   *
   * Cada aviso era um bloco solto no topo, com a própria borda e a própria
   * cor. Com dois ou três ao mesmo tempo — e eles acontecem juntos: mês
   * virando, aula cancelada — o aluno abria o painel numa parede de vermelho
   * e âmbar antes de chegar ao check-in, que é o que ele veio fazer.
   *
   * A aula cancelada vem primeiro de propósito: é a única que muda o que ele
   * vai fazer na próxima hora.
   */
  const avisos: {
    readonly key: string;
    readonly tone: 'late' | 'warn';
    readonly title: string;
    readonly detail: string;
    readonly href?: string;
    readonly cta?: string;
  }[] = [];

  if (canceladasHoje.length > 0) {
    avisos.push({
      key: 'canceladas',
      tone: 'late',
      title: canceladasHoje.length === 1 ? 'Aula cancelada hoje' : 'Aulas canceladas hoje',
      detail: canceladasHoje
        .map((slot) => `${slot.title} · ${slot.startTime} às ${slot.endTime}`)
        .join(' — '),
    });
  }

  if (payment && payment.status === 'vencida') {
    avisos.push({
      key: 'vencida',
      tone: 'late',
      title: `Mensalidade vencida em ${formatBr(payment.dueDate)}`,
      detail: `${formatCents(payment.amountCents)} · pode pagar até ${formatBr(payment.limitDate)}`,
      href: '#mensalidade',
      cta: 'Ver detalhes',
    });
  } else if (payment && diasAteVencer !== null && diasAteVencer >= 0 && diasAteVencer <= 3) {
    avisos.push({
      key: 'vence',
      tone: 'warn',
      title:
        diasAteVencer === 0
          ? 'Sua mensalidade vence hoje'
          : `Sua mensalidade vence em ${diasAteVencer} ${diasAteVencer === 1 ? 'dia' : 'dias'}`,
      detail: `${formatCents(payment.amountCents)} · pode pagar até ${formatBr(payment.limitDate)}`,
      href: '#mensalidade',
      cta: 'Ver detalhes',
    });
  }

  const emAula = nextClass !== null && nextClass.minutesUntilStart === 0;
  const ultimoTreino = checkins[0] ?? null;

  return (
    <div className="page-stack">
      <header>
        <p className="eyebrow">Olá, {student.name.split(' ')[0]}</p>
        <h1 className="mt-2 text-3xl leading-none sm:text-4xl">Meu painel</h1>
      </header>

      {avisos.length > 0 ? (
        <div role="status" className="space-y-2">
          {avisos.map((aviso) => (
            <div
              key={aviso.key}
              className={cn(
                'flex flex-wrap items-center justify-between gap-x-4 gap-y-2',
                aviso.tone === 'late' ? 'notice-late' : 'notice-warn',
              )}
            >
              <div className="min-w-0">
                <p
                  className={cn(
                    'text-sm font-semibold',
                    aviso.tone === 'late' ? 'text-crimson' : 'text-amber-300',
                  )}
                >
                  {aviso.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{aviso.detail}</p>
              </div>
              {aviso.href ? (
                <Link href={aviso.href} className="btn-secondary shrink-0 text-xs">
                  {aviso.cta}
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/*
        Check-in em destaque: é a ação do dia, e o painel existe para ela.
        Quando a aula do aluno está acontecendo agora, o bloco acende em
        vermelho — é o único momento em que o check-in tem hora marcada.
      */}
      <section
        className={cn(
          'panel panel-pad flex flex-wrap items-center justify-between gap-4',
          faltaMarcar.length > 0
            ? 'border-crimson/40 bg-crimson/[.06]'
            : checkedInToday
              ? 'border-emerald-500/30 bg-emerald-500/[.05]'
              : null,
        )}
      >
        <div className="min-w-0">
          <h2 className="panel-title">
            {faltaMarcar.length > 0
              ? checkedInToday
                ? 'Você tem outra aula agora'
                : emAula
                  ? 'Sua aula está acontecendo agora'
                  : 'Registrar presença'
              : checkedInToday
                ? presencasHoje.length === 1
                  ? 'Presença registrada hoje'
                  : `${presencasHoje.length} presenças registradas hoje`
                : 'Registrar presença'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {faltaMarcar.length > 0
              ? `${faltaMarcar[0]?.title ?? 'Sua turma'} · ${faltaMarcar[0]?.startTime ?? ''}. Leia o QR da recepção.`
              : checkedInToday
                ? 'Bom treino!'
                : 'Leia o QR Code da recepção quando chegar no tatame.'}
          </p>

          {/*
            Cada aula marcada hoje, com a hora. Quem treina duas seguidas
            precisa ver as duas — era aqui que o segundo treino sumia.
          */}
          {presencasHoje.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {presencasHoje.map((entry) => (
                <li key={entry.at} className="badge-ok">
                  {entry.classTitle ?? 'Treino'} · {saoPauloTimeString(entry.at)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {faltaMarcar.length > 0 || !checkedInToday ? (
          <Link href="/painel/checkin" className="btn-primary shrink-0">
            {checkedInToday ? 'Marcar a próxima' : 'Fazer check-in'}
          </Link>
        ) : null}
      </section>

      {/*
        Frequência numa faixa só. Eram quatro números empilhados dentro de um
        cartão, lidos de cima para baixo; aqui o olho pega a sequência inteira
        de uma vez, e a meta do mês ganha a barra que a fração não dá.
      */}
      <StatStrip>
        <Stat label="Total de treinos" value={String(total)} tone="destaque" />
        <Stat
          label="Este mês"
          value={aulasNoMes > 0 ? `${thisMonth}/${aulasNoMes}` : String(thisMonth)}
          {...(aulasNoMes > 0
            ? { progress: { value: thisMonth, max: aulasNoMes }, hint: 'da sua grade no mês' }
            : {})}
        />
        <Stat label="Últimos 90 dias" value={String(last90)} />
        <Stat
          label="Último treino"
          value={ultimoTreino ? formatBr(ultimoTreino.date).slice(0, 5) : '--'}
          {...(ultimoTreino ? { hint: `às ${saoPauloTimeString(ultimoTreino.at)}` } : {})}
        />
      </StatStrip>

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
              {nextClass.custom ? (
                <p className="badge-warn mt-3">Horário especial só neste dia</p>
              ) : null}
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">
              Nenhuma turma atribuída ainda. A recepção define suas aulas na matrícula.
            </p>
          )}
        </section>

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
                {isKids ? ` de ${KIDS_TOTAL_DEGREES}` : ''}
              </p>

              {/*
                Escada de graus da trilha infantil, desenhada. São doze degraus
                até a próxima faixa: "4 graus de 12" é uma conta, e a criança
                que acompanha a própria evolução não deveria precisar fazer.
              */}
              {isKids ? (
                <div className="mt-2.5 flex gap-1" aria-hidden>
                  {Array.from({ length: KIDS_TOTAL_DEGREES }, (_, index) => (
                    <span
                      key={index}
                      className={cn(
                        'h-1.5 flex-1 rounded-full',
                        index < student.degree ? 'bg-crimson' : 'bg-white/[.09]',
                      )}
                    />
                  ))}
                </div>
              ) : null}

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
            'panel panel-pad',
            payment?.status === 'vencida'
              ? 'border-crimson/40'
              : payment?.status === 'vence_em_breve'
                ? 'border-amber-500/35'
                : null,
          )}
        >
          <h2 className="panel-title">Mensalidade</h2>

          {payment && plan ? (
            <>
              <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="font-display text-3xl leading-none tabular-nums text-foreground">
                  {formatCents(payment.amountCents)}
                </p>
                {paymentStyle ? (
                  <span className={paymentStyle.badge}>{paymentStyle.label}</span>
                ) : null}
              </div>

              <dl className="mt-4 space-y-2 border-t border-hairline pt-4 text-sm text-foreground">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Plano</dt>
                  {/*
                    O nome contratado vem primeiro, porque é o que o aluno
                    reconhece ("Trimestral MMA"). O período fica ao lado para
                    não perder a informação de cobrança. Mensalidades antigas
                    não têm nome e mostram só o período, como antes.
                  */}
                  <dd className="text-right">
                    {payment.planName ? (
                      <>
                        {payment.planName}
                        <span className="block text-xs text-muted">
                          {PLAN_LABELS[payment.planId]}
                        </span>
                      </>
                    ) : (
                      PLAN_LABELS[payment.planId]
                    )}
                  </dd>
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
        {/* Minhas aulas ------------------------------------------------- */}
        <section className="panel panel-pad">
          <h2 className="panel-title">Minhas aulas na semana</h2>

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

        {/* Últimos treinos ---------------------------------------------- */}
        <section
          id="frequencia"
          // Destino de "Meus treinos" na barra inferior. A margem evita que o
          // cabeçalho fixo cubra o título ao pular para cá.
          style={{ scrollMarginTop: 80 }}
          className="panel panel-pad lg:col-span-2"
        >
          <h2 className="panel-title">Últimos treinos</h2>

          {checkins.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              Nenhuma presença registrada ainda. O primeiro check-in aparece aqui.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-hairline">
              {checkins.slice(0, 10).map((entry) => (
                <li
                  key={entry.at}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{entry.classTitle ?? 'Treino'}</p>
                    <p className="text-xs tabular-nums text-muted">
                      {formatBr(entry.date)} às {saoPauloTimeString(entry.at)}
                    </p>
                  </div>
                  <span className="badge-neutral shrink-0">
                    {CHECKIN_SOURCE_LABELS[entry.source]}
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
