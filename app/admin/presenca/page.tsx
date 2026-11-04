import type { Metadata } from 'next';

import { PageHeader } from '@/components/app/PageHeader';

import { requirePermission } from '@/lib/auth';
import { checkinInClass, getTodayCheckins } from '@/lib/repositories/attendance';
import { listStudentsByStatus } from '@/lib/repositories/students';
import { getUnitScope } from '@/lib/unitScope';
import { filterByUnit } from '@/types/domain';
import { getEffectiveSchedule } from '@/lib/schedule';
import { weekdayLabels, weekdayShortLabels, type Weekday } from '@/data/seed';
import { findOpenClasses, occursOnDate } from '@/utils/attendanceEngine';
import { recurringOnly } from '@/utils/classOverrides';
import { saoPauloDateString, saoPauloParts, saoPauloTimeString } from '@/utils/datetime';

import { PresenceList, type PresenceRow, type TurmaResumo } from './PresenceList';

export const metadata: Metadata = { title: 'Presença' };
export const dynamic = 'force-dynamic';

export default async function PresencaPage({
  searchParams,
}: {
  searchParams: Promise<{ turma?: string }>;
}) {
  await requirePermission('aula');

  const now = new Date();
  const hoje = saoPauloDateString(now);

  const scope = await getUnitScope();

  const [todos, schedule] = await Promise.all([
    listStudentsByStatus('ativo'),
    getEffectiveSchedule(now),
  ]);

  // A chamada é sempre de uma academia: lista e grade seguem o recorte.
  const students = filterByUnit(todos, scope);
  const classes = filterByUnit(schedule.classes, scope);

  const checkins = await getTodayCheckins(
    students.map((student) => student.id),
    now,
  );

  const abertas = new Set(
    findOpenClasses(classes, classes.map((slot) => slot.id), now).map((slot) => slot.classId),
  );

  /*
   * Turmas selecionáveis.
   *
   * A lista é das recorrentes, uma linha por turma: a ocorrência personalizada
   * é a mesma turma em outro horário e entraria duas vezes. O que ela traz é a
   * marca de "acontece hoje", que chega pelo id.
   */
  const doDia = new Set(
    classes.filter((slot) => occursOnDate(slot, hoje)).map((slot) => slot.id),
  );

  const turmas: TurmaResumo[] = recurringOnly(classes)
    .map((slot) => {
      const matriculados = students.filter((student) => student.classIds.includes(slot.id));
      return {
        id: slot.id,
        label: `${weekdayShortLabels[slot.weekday as Weekday]} ${slot.startTime} · ${slot.title}`,
        weekdayLabel: weekdayLabels[slot.weekday as Weekday],
        startTime: slot.startTime,
        title: slot.title,
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

  const { turma: turmaParam } = await searchParams;
  const escolhida = turmas.find((item) => item.id === turmaParam) ?? null;

  /*
   * As linhas da lista.
   *
   * Com turma escolhida é a chamada dela: só os matriculados, e o "presente"
   * é a presença **naquela aula**. Sem turma é a visão da academia inteira, e
   * aí "presente" é qualquer presença de hoje — a pergunta ali é outra.
   */
  const base = escolhida
    ? students.filter((student) => student.classIds.includes(escolhida.id))
    : students;

  const rows: PresenceRow[] = base
    .map((student) => {
      const doDiaDele = checkins.get(student.id) ?? [];
      const entry = escolhida
        ? checkinInClass(checkins, student.id, escolhida.id)
        : (doDiaDele[0] ?? null);

      const open = findOpenClasses(classes, student.classIds, now);

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
        elsewhere:
          entry === null && noutra
            ? `já marcou às ${saoPauloTimeString(noutra.at)}${noutra.classTitle ? ` em ${noutra.classTitle}` : ''}`
            : null,
        classIds: student.classIds,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const { day, month, year } = saoPauloParts(now);
  const todayLabel = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;

  return (
    <div className="page-stack">
      <PageHeader title="Presença" />

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
          />
        </div>
      )}
    </div>
  );
}
