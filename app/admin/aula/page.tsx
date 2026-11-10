import type { Metadata } from 'next';
import Link from 'next/link';

import { weekdayLabels, weekdayShortLabels, type Weekday } from '@/data/seed';
import { requirePermission } from '@/lib/auth';
import {
  checkinInClass,
  countCheckins,
  getCheckinsOn,
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
import { attendeesOf, belongsToClass } from '@/utils/classAttendees';
import { recurringOnly } from '@/utils/classOverrides';
import { formatBr, saoPauloDateString, saoPauloTimeString } from '@/utils/datetime';
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

  /*
   * Os alunos da outra academia, para a presença avulsa alcançá-los.
   *
   * Eles não entram na chamada — a lista da aula é dos matriculados desta
   * unidade, e dobrá-la com gente que não vem a tornaria inútil. Entram na
   * **busca**: quem é de Terra de Areia e apareceu aqui numa quinta precisa
   * ser encontrado pelo nome, senão o professor não tem como lançar a
   * presença dele e o treino não fica registrado em lugar nenhum.
   */
  const visitantes = todos.filter((student) => !students.includes(student));

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

  /*
   * Turmas avulsas num bloco próprio.
   *
   * Elas não são da grade — `recurringOnly` as descarta — e só entram em
   * `doDia` na data delas. Sem esta lista, o professor que quisesse fazer a
   * chamada do treino de sábado às duas da tarde, ou na segunda seguinte,
   * não tinha como abrir a aula: a tela dizia "nenhuma aula para abrir" e o
   * seletor de fallback só oferecia a grade.
   */
  const avulsas = classes
    .filter((slot) => slot.openToAll === true && slot.onlyOnDate !== undefined)
    .sort((a, b) => (b.onlyOnDate ?? '').localeCompare(a.onlyOnDate ?? ''));

  /*
   * Qual aula a tela abre.
   *
   * A escolha explícita (`?turma=`) é procurada na grade inteira, e não só
   * na lista de hoje: é o que permite abrir o sábado avulso em qualquer dia
   * para lançar a chamada atrasada. A lista de hoje vem primeiro para a aula
   * remarcada abrir com o horário de hoje, e não com o da grade.
   *
   * Sem escolha, abre a que está acontecendo. Não havendo nenhuma, abre a
   * turma avulsa de hoje — ela é a única que o professor não tem outro
   * caminho para alcançar, e num dia de avulsa é ela que ele veio ver.
   */
  const { turma } = await searchParams;
  const escolhida =
    doDia.find((slot) => slot.id === turma) ??
    outrasTurmas.find((slot) => slot.id === turma) ??
    avulsas.find((slot) => slot.id === turma) ??
    doDia.find((slot) => slot.id === abertas[0]?.classId) ??
    doDia.find((slot) => slot.openToAll === true) ??
    null;

  if (!escolhida) {
    return (
      <div className="page-stack">
        <PageHeader
          title="Modo aula"
          meta="Durante o treino: cronômetro, chamada e diário da aula."
        />
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
        {avulsas.length > 0 ? (
          <div className="mt-5 text-left">
            <p className="panel-title">Turmas avulsas</p>
            <SeletorDeTurma turmas={avulsas} atual={null} scope={scope} comData />
          </div>
        ) : null}

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

  /*
   * O dia desta chamada.
   *
   * Quase sempre hoje. A turma avulsa e a ocorrência remarcada carregam a
   * data na própria aula, e é dela que a chamada sai: abrindo o treino de
   * sábado numa segunda, ler as presenças de hoje mostraria a lista vazia e o
   * professor marcaria todo mundo de novo.
   */
  const diaDaAula = escolhida.onlyOnDate ?? hoje;
  const retroativa = diaDaAula !== hoje;

  /*
   * O visitante entra na leitura de presenças, mas não nas de dinheiro.
   *
   * Sem ele em `checkins`, marcá-lo não mudava nada na tela: a linha
   * continuava mostrando o botão "Marcar avulso" como se nada tivesse sido
   * gravado. `plans` e `totais` ficam de fora de propósito — mensalidade de
   * aluno de outra unidade não é assunto desta tela, e `totais` é uma leitura
   * por aluno, que dobraria para servir uma busca de seis linhas.
   */
  const ids = students.map((student) => student.id);
  const idsComVisita = [...ids, ...visitantes.map((student) => student.id)];
  const [checkins, plans, diario] = await Promise.all([
    getCheckinsOn(idsComVisita, diaDaAula),
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
      // Visita entre as duas academias: marca, não impedimento. O professor
      // precisa saber que aquele aluno não é da turma daqui; o sistema não
      // precisa recusar a presença por isso.
      visitor: student.unit !== escolhida.unit,
      haystack: buildHaystack([student.name]),
    };
  };

  /*
   * A chamada: quem é da turma, mais quem de fato treinou nela.
   *
   * A primeira parte vem da matrícula. Na turma avulsa, da unidade: ela não
   * existe na grade, então ninguém a tem na ficha e filtrar por matrícula
   * devolveria lista vazia justamente na aula aberta.
   *
   * A segunda parte é nova e corrige um buraco: quem foi marcado como avulso
   * — o aluno de outra turma, ou o visitante da outra academia — saía da
   * lista no instante seguinte, porque não pertence à turma. O professor
   * marcava, a linha desaparecia, e o contador "X de Y na chamada" seguia
   * sem ele. Quem tem presença nesta aula está nesta chamada, ponto.
   */
  const naChamada = [
    ...attendeesOf(students, escolhida),
    ...visitantes.filter(
      (student) => checkinInClass(checkins, student.id, escolhida.id) !== null,
    ),
  ];
  const naChamadaIds = new Set(naChamada.map((student) => student.id));

  const matriculados = naChamada
    .map((student) => toRow(student, !belongsToClass(student, escolhida)))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const convidados = [...students, ...visitantes]
    .filter((student) => !naChamadaIds.has(student.id))
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
      <PageHeader
        title="Modo aula"
        meta="Durante o treino: cronômetro, chamada e diário da aula."
        actions={
          <Link href="/admin/presenca" className="btn-secondary text-sm">
            Lançar chamada de outro dia
          </Link>
        }
      />

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
            emAndamento
              ? 'bg-crimson text-foreground'
              : retroativa
                ? 'bg-amber-500/20 text-amber-300'
                : 'bg-white/[.07] text-muted',
          )}
        >
          {emAndamento
            ? 'Acontecendo agora'
            : retroativa
              ? `Chamada de ${formatBr(diaDaAula)}`
              : 'Fora do horário'}
        </span>
      </div>

      {doDia.length > 1 ? <SeletorDeTurma turmas={doDia} atual={escolhida.id} scope={scope} /> : null}

      {/*
        As avulsas ficam sempre à mão, e não só quando a tela abre vazia: é
        aqui que o professor chega depois do treino de sábado para lançar a
        chamada, com a aula da noite já aberta na frente dele.
      */}
      {avulsas.length > 0 ? (
        <div>
          <p className="panel-title">Turmas avulsas</p>
          <SeletorDeTurma turmas={avulsas} atual={escolhida.id} scope={scope} comData />
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[1fr_20rem]">
        <section className="panel panel-pad min-w-0">
          <ClassRoster
            classId={escolhida.id}
            rows={matriculados}
            guests={convidados}
            date={retroativa ? diaDaAula : null}
          />
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
  comData = false,
}: {
  readonly turmas: readonly {
    id: string;
    title: string;
    startTime: string;
    weekday: number;
    unit: string;
    onlyOnDate?: string;
  }[];
  readonly atual: string | null;
  readonly scope: string;
  /** Prefixa o dia da semana: usado na grade, onde a turma se repete. */
  readonly comDia?: boolean;
  /**
   * Prefixa a data: usado na turma avulsa, que acontece uma vez.
   *
   * "Sáb 09:00" não distingue dois treinos de sábado em semanas diferentes, e
   * é exatamente isso que a lista de avulsas tem.
   */
  readonly comData?: boolean;
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
          {comData && slot.onlyOnDate ? `${formatBr(slot.onlyOnDate).slice(0, 5)} ` : ''}
          {comDia ? `${weekdayShortLabels[slot.weekday as Weekday]} ` : ''}
          {slot.startTime} · {slot.title}
          {scope === 'todas' ? ` · ${UNIT_SHORT[slot.unit as 'tres-cachoeiras']}` : ''}
        </Link>
      ))}
    </div>
  );
}
