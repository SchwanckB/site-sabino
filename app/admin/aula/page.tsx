import type { Metadata } from 'next';
import Link from 'next/link';

import { weekdayLabels, weekdayShortLabels, type Weekday } from '@/data/seed';
import { requirePermission } from '@/lib/auth';
import {
  checkinInClass,
  countCheckins,
  getTodayCheckins,
} from '@/lib/repositories/attendance';
import { listClassLog } from '@/lib/repositories/classLog';
import { getPaymentPlans } from '@/lib/repositories/payments';
import { listStudentsByStatus } from '@/lib/repositories/students';
import { can } from '@/lib/roles';
import { getEffectiveSchedule } from '@/lib/schedule';
import { getUnitScope } from '@/lib/unitScope';
import { cn } from '@/lib/utils';
import { UNIT_SHORT, filterByUnit } from '@/types/domain';
import { findOpenClasses, occursOnDate } from '@/utils/attendanceEngine';
import { recurringOnly } from '@/utils/classOverrides';
import { saoPauloDateString, saoPauloTimeString } from '@/utils/datetime';
import { getKidsGraduationStatus } from '@/utils/graduationEngine';
import { getPaymentSummary } from '@/utils/paymentEngine';
import { buildHaystack } from '@/utils/searchText';

import { PageHeader } from '@/components/app/PageHeader';

import { ClassDiary, type DiaryEntry } from './ClassDiary';
import { ClassRoster, type RosterRow } from './ClassRoster';
import { RoundTimer } from './RoundTimer';

export const metadata: Metadata = { title: 'Modo aula' };
export const dynamic = 'force-dynamic';

/** Até quantos check-ins o aluno ainda conta como novo. */
const AULAS_DE_NOVATO = 3;

export default async function AulaPage({
  searchParams,
}: {
  searchParams: Promise<{ turma?: string }>;
}) {
  const admin = await requirePermission('aula');
  const verDinheiro = can(admin.role, 'dinheiro');

  const now = new Date();
  const hoje = saoPauloDateString(now);
  const scope = await getUnitScope();

  const [schedule, todos] = await Promise.all([getEffectiveSchedule(now), listStudentsByStatus('ativo')]);

  const students = filterByUnit(todos, scope);
  const classes = filterByUnit(schedule.classes, scope);

  // A aula em andamento é o padrão: é o motivo de a tela existir.
  const abertas = findOpenClasses(classes, classes.map((slot) => slot.id), now);

  // As aulas de hoje, e não as turmas de hoje: a que foi remarcada aparece no
  // horário novo, uma vez só.
  const doDia = classes
    .filter((slot) => occursOnDate(slot, hoje))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Grade inteira, para quando não há aula no dia de hoje. Sem as ocorrências
  // personalizadas: nesta lista elas repetiriam a própria turma.
  const outrasTurmas = recurringOnly(classes).sort(
    (a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime),
  );

  // A turma escolhida vem primeiro da lista de hoje, para a aula remarcada
  // abrir com o horário de hoje e não com o da grade.
  const { turma } = await searchParams;
  const escolhida =
    doDia.find((slot) => slot.id === turma) ??
    outrasTurmas.find((slot) => slot.id === turma) ??
    doDia.find((slot) => slot.id === abertas[0]?.classId) ??
    null;

  if (!escolhida) {
    return (
      <div className="page-stack">
        <PageHeader title="Modo aula" />
        <div className="panel px-5 py-10 text-center">
          <p className="font-display text-lg uppercase tracking-tight">Nenhuma aula para abrir</p>
          <p className="mt-2 text-sm text-muted">
            {classes.length === 0
              ? 'Cadastre a grade desta academia em Horários.'
              : 'Escolha uma turma na lista de hoje ou volte no horário do treino.'}
          </p>
          {/*
            O treino que sai do horário é justo quando esta tela aparece vazia.
            Mandar o professor procurar onde se marca isso, no meio da aula,
            seria o pior momento possível.
          */}
          {classes.length > 0 ? (
            <p className="mt-2 text-sm text-muted">
              Vai treinar em outro horário hoje?{' '}
              <Link href="/admin/horarios" className="text-crimson underline">
                Marque uma aula personalizada
              </Link>
              .
            </p>
          ) : null}
        {/*
          Sábado, domingo ou feriado: não há aula hoje, mas o professor pode
          querer rever o diário ou lançar uma presença atrasada. Mandar ele
          "escolher na lista de hoje" quando essa lista está vazia é um beco.
        */}
        {outrasTurmas.length > 0 ? (
          <div className="mt-5 text-left">
            <p className="panel-title">Abrir outra turma</p>
            <SeletorDeTurma turmas={outrasTurmas} atual={null} scope={scope} comDia />
          </div>
        ) : null}
        </div>
      </div>
    );
  }

  const ids = students.map((student) => student.id);
  const [checkins, plans, diario] = await Promise.all([
    getTodayCheckins(ids, now),
    // A marca de "devendo" na lista da aula é dinheiro: para o professor a
    // mensalidade não é nem lida. Ver `lib/roles.ts`.
    verDinheiro ? getPaymentPlans(ids) : new Map(),
    listClassLog(escolhida.id, 6),
  ]);

  const totais = new Map(
    await Promise.all(
      students.map(async (student): Promise<[string, number]> => [
        student.id,
        await countCheckins(student.id),
      ]),
    ),
  );

  const toRow = (student: (typeof students)[number], guest: boolean): RosterRow => {
    /*
     * A presença **desta aula**, não a do dia.
     *
     * Antes era `checkins.get(student.id)`: bastava o aluno ter batido
     * presença em qualquer turma para a chamada desta aparecer marcada — e,
     * abrindo uma turma de outro dia da semana, ela já vinha preenchida com a
     * presença de hoje. Presença é por aula realizada.
     */
    const entry = checkinInClass(checkins, student.id, escolhida.id);

    // A presença que o aluno tem hoje em OUTRA turma: não marca a chamada,
    // mas explica por que ele está na academia sem check nesta lista.
    const noutra = (checkins.get(student.id) ?? []).find(
      (item) => item.classId !== escolhida.id,
    );

    const plan = plans.get(student.id);
    const summary = plan ? getPaymentSummary(plan, now) : null;

    const podeGraduar =
      student.category === 'kids' &&
      getKidsGraduationStatus(
        {
          id: student.id,
          name: student.name,
          birthDate: student.birthDate,
          joinedAt: student.joinedAt ?? student.createdAt,
          lastGraduationAt: student.lastGraduationAt,
          degree: student.degree,
          belt: student.belt,
          graduatesMonthly: student.graduatesMonthly,
        },
        now,
      ).status === 'ELEGIVEL';

    return {
      id: student.id,
      name: student.name,
      belt: student.belt,
      degree: student.degree,
      present: entry !== null,
      presentAt: entry ? saoPauloTimeString(entry.at) : null,
      elsewhere:
        entry === null && noutra
          ? `já marcou às ${saoPauloTimeString(noutra.at)}${noutra.classTitle ? ` em ${noutra.classTitle}` : ''}`
          : null,
      note: student.notes,
      isNew: (totais.get(student.id) ?? 0) <= AULAS_DE_NOVATO,
      dueGraduation: podeGraduar,
      overdue: summary?.status === 'vencida',
      guest,
      haystack: buildHaystack([student.name]),
    };
  };

  const matriculados = students
    .filter((student) => student.classIds.includes(escolhida.id))
    .map((student) => toRow(student, false))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const convidados = students
    .filter((student) => !student.classIds.includes(escolhida.id))
    .map((student) => toRow(student, true))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const hojeNoDiario = diario.find((entry) => entry.date === hoje);
  const anteriores: DiaryEntry[] = diario
    .filter((entry) => entry.date !== hoje)
    .slice(0, 3)
    .map((entry) => ({ date: entry.date, text: entry.text }));

  const emAndamento = abertas.some((slot) => slot.classId === escolhida.id);

  return (
    <div className="page-stack">
      <PageHeader title="Modo aula" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-xl uppercase tracking-tight text-foreground">
            {escolhida.title}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {weekdayLabels[escolhida.weekday as Weekday]}, {escolhida.startTime} às{' '}
            {escolhida.endTime}
            {escolhida.level ? ` · ${escolhida.level}` : ''}
            {escolhida.teacher ? ` · com ${escolhida.teacher}` : ''}
            {scope === 'todas' ? ` · ${UNIT_SHORT[escolhida.unit]}` : ''}
          </p>
        </div>

        <span
          className={cn(
            'shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold',
            emAndamento ? 'bg-crimson text-foreground' : 'bg-white/[.07] text-muted',
          )}
        >
          {emAndamento ? 'Acontecendo agora' : 'Fora do horário'}
        </span>
      </div>

      {doDia.length > 1 ? <SeletorDeTurma turmas={doDia} atual={escolhida.id} scope={scope} /> : null}

      <div className="grid gap-3 lg:grid-cols-[1fr_20rem]">
        <section className="panel panel-pad min-w-0">
          <ClassRoster classId={escolhida.id} rows={matriculados} guests={convidados} />
        </section>

        <div className="min-w-0 space-y-3">
          <RoundTimer />
          <ClassDiary
            classId={escolhida.id}
            today={hoje}
            todayText={hojeNoDiario?.text ?? ''}
            previous={anteriores}
          />
        </div>
      </div>
    </div>
  );
}

function SeletorDeTurma({
  turmas,
  atual,
  scope,
  comDia = false,
}: {
  readonly turmas: readonly {
    id: string;
    title: string;
    startTime: string;
    weekday: number;
    unit: string;
  }[];
  readonly atual: string | null;
  readonly scope: string;
  readonly comDia?: boolean;
}) {
  return (
    <div role="group" aria-label="Turmas de hoje" className="mt-4 flex flex-wrap gap-2">
      {turmas.map((slot) => (
        <Link
          key={slot.id}
          href={`/admin/aula?turma=${encodeURIComponent(slot.id)}`}
          aria-current={slot.id === atual ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-[44px] items-center rounded-xl border px-3.5 text-sm transition-colors',
            slot.id === atual
              ? 'border-crimson bg-crimson text-foreground'
              : 'border-hairline bg-white/[.04] text-muted hover:text-foreground',
          )}
        >
          {comDia ? `${weekdayShortLabels[slot.weekday as Weekday]} ` : ''}
          {slot.startTime} · {slot.title}
          {scope === 'todas' ? ` · ${UNIT_SHORT[slot.unit as 'tres-cachoeiras']}` : ''}
        </Link>
      ))}
    </div>
  );
}
