import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/app/PageHeader';

import { requirePermission } from '@/lib/auth';
import { checkinInClass, getCheckinsOn } from '@/lib/repositories/attendance';
import { listStudentsByStatus } from '@/lib/repositories/students';
import { getUnitScope } from '@/lib/unitScope';
import { filterByUnit } from '@/types/domain';
import { getEffectiveSchedule } from '@/lib/schedule';
import { weekdayLabels, weekdayShortLabels, type Weekday } from '@/data/seed';
import { findOpenClasses, occursOnDate } from '@/utils/attendanceEngine';
import { attendeesOf } from '@/utils/classAttendees';
import { recurringOnly } from '@/utils/classOverrides';
import { addDays, formatBr, saoPauloDateString, saoPauloTimeString } from '@/utils/datetime';

import { PresenceList, type PresenceRow, type TurmaResumo } from './PresenceList';

export const metadata: Metadata = { title: 'Presença' };
export const dynamic = 'force-dynamic';

export default async function PresencaPage({
  searchParams,
}: {
  searchParams: Promise<{ turma?: string; dia?: string }>;
}) {
  await requirePermission('aula');

  const now = new Date();
  const hoje = saoPauloDateString(now);

  const { turma: turmaParam, dia: diaParam } = await searchParams;

  /*
   * O dia da chamada.
   *
   * Quase sempre hoje. O passado existe para a chamada que ninguém lançou na
   * hora — a turma da manhã lembrada à tarde, ou no dia seguinte. Futuro não:
   * presença é registro do que aconteceu, e uma data à frente só entra por
   * engano de digitação. Até 60 dias atrás, que é o alcance da trava que
   * impede lançar a mesma chamada duas vezes.
   */
  const limite = addDays(hoje, -60);
  const dia =
    diaParam && /^\d{4}-\d{2}-\d{2}$/.test(diaParam) && diaParam <= hoje && diaParam >= limite
      ? diaParam
      : hoje;
  const retroativo = dia !== hoje;

  const scope = await getUnitScope();

  const [todos, schedule] = await Promise.all([
    listStudentsByStatus('ativo'),
    getEffectiveSchedule(now),
  ]);

  // A chamada é sempre de uma academia: lista e grade seguem o recorte.
  const students = filterByUnit(todos, scope);
  const classes = filterByUnit(schedule.classes, scope);

  const checkins = await getCheckinsOn(
    students.map((student) => student.id),
    dia,
  );

  // "Acontecendo agora" só faz sentido hoje. Numa chamada retroativa a marca
  // seria sobre o relógio de agora, não sobre o dia que está sendo lançado.
  const abertas = retroativo
    ? new Set<string>()
    : new Set(
        findOpenClasses(classes, classes.map((slot) => slot.id), now).map(
          (slot) => slot.classId,
        ),
      );

  /*
   * Turmas selecionáveis.
   *
   * As recorrentes entram uma vez cada: a ocorrência personalizada é a mesma
   * turma em outro horário e apareceria duas vezes. O que ela traz é a marca
   * de "acontece hoje", que chega pelo id.
   *
   * A turma avulsa entra à parte. Ela só existe naquela data — `recurringOnly`
   * a descartaria junto com as ocorrências personalizadas — e é justamente
   * nela que o professor precisa clicar no sábado em que a abriu.
   */
  const doDia = new Set(
    classes.filter((slot) => occursOnDate(slot, dia)).map((slot) => slot.id),
  );

  const avulsasDoDia = classes.filter(
    (slot) => slot.openToAll === true && occursOnDate(slot, dia),
  );

  const turmas: TurmaResumo[] = [...avulsasDoDia, ...recurringOnly(classes)]
    .map((slot) => {
      const matriculados = attendeesOf(students, slot);
      const avulsa = slot.openToAll === true;

      return {
        id: slot.id,
        label: avulsa
          ? `${formatBr(slot.onlyOnDate ?? dia).slice(0, 5)} ${slot.startTime} · ${slot.title}`
          : `${weekdayShortLabels[slot.weekday as Weekday]} ${slot.startTime} · ${slot.title}`,
        weekdayLabel: avulsa
          ? `Avulsa de ${formatBr(slot.onlyOnDate ?? dia)}`
          : weekdayLabels[slot.weekday as Weekday],
        startTime: slot.startTime,
        title: slot.title,
        unit: slot.unit,
        openToAll: avulsa,
        openNow: abertas.has(slot.id),
        happensToday: doDia.has(slot.id),
        total: matriculados.length,
        presentes: matriculados.filter(
          (student) => checkinInClass(checkins, student.id, slot.id) !== null,
        ).length,
      };
    })
    .filter((turma) => turma.total > 0)
    .sort((a, b) => {
      // A de agora primeiro, depois as de hoje, depois o resto da semana.
      if (a.openNow !== b.openNow) return a.openNow ? -1 : 1;
      if (a.happensToday !== b.happensToday) return a.happensToday ? -1 : 1;
      return a.label.localeCompare(b.label, 'pt-BR');
    });

  const escolhida = turmas.find((item) => item.id === turmaParam) ?? null;

  /*
   * As linhas da lista.
   *
   * Com turma escolhida é a chamada dela: só os matriculados, e o "presente"
   * é a presença **naquela aula**. Sem turma é a visão da academia inteira, e
   * aí "presente" é qualquer presença de hoje — a pergunta ali é outra.
   */
  const base = escolhida ? attendeesOf(students, escolhida) : students;

  const rows: PresenceRow[] = base
    .map((student) => {
      const doDiaDele = checkins.get(student.id) ?? [];
      const entry = escolhida
        ? checkinInClass(checkins, student.id, escolhida.id)
        : (doDiaDele[0] ?? null);

      const open = retroativo ? [] : findOpenClasses(classes, student.classIds, now);

      // Presença de hoje em outra turma: não marca esta chamada, mas explica
      // o aluno que já passou pela academia mais cedo.
      const noutra = escolhida
        ? doDiaDele.find((item) => item.classId !== escolhida.id)
        : undefined;

      return {
        id: student.id,
        name: student.name,
        belt: student.belt,
        degree: student.degree,
        inClassNow: open[0] ? `${open[0].title} · ${open[0].startTime}` : null,
        present: entry !== null,
        presentAt: entry ? saoPauloTimeString(entry.at) : null,
        presentSource: entry?.source ?? null,
        presentClass: entry?.classTitle ?? null,
        presentClassId: entry?.classId ?? null,
        openClassId: escolhida ? escolhida.id : (open[0]?.classId ?? null),
        elsewhere:
          entry === null && noutra
            ? `já marcou às ${saoPauloTimeString(noutra.at)}${noutra.classTitle ? ` em ${noutra.classTitle}` : ''}`
            : null,
        classIds: student.classIds,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const todayLabel = formatBr(dia);

  return (
    <div className="page-stack">
      <PageHeader
        title="Presença"
        meta="Depois do treino: acertar a chamada de qualquer turma e de qualquer dia."
        actions={
          <Link href="/admin/aula" className="btn-secondary text-sm">
            Abrir o modo aula
          </Link>
        }
      />

      {students.length === 0 ? (
        <div className="panel px-6 py-16 text-center">
          <p className="font-display text-lg uppercase tracking-tight">Nenhum aluno ativo</p>
          <p className="mt-2 text-sm text-muted">
            Aprove os cadastros em Aprovações para que eles apareçam na chamada.
          </p>
        </div>
      ) : (
        <div className="mt-8">
          <PresenceList
            rows={rows}
            todayLabel={todayLabel}
            turmas={turmas}
            selected={escolhida}
            dia={dia}
            hoje={hoje}
            minDate={limite}
          />
        </div>
      )}
    </div>
  );
}
