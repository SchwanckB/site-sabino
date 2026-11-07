import type { Metadata } from 'next';

import { PageHeader } from '@/components/app/PageHeader';

import { weekdayLabels, type Weekday } from '@/data/seed';
import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/roles';
import { listUpcomingClassOverrides } from '@/lib/repositories/classOverrides';
import { listUpcomingOneOffClasses } from '@/lib/repositories/oneOffClasses';
import { listStudentsByStatus } from '@/lib/repositories/students';
import { getEditableSchedule } from '@/lib/repositories/scheduleAdmin';
import { getUnitScope } from '@/lib/unitScope';
import { filterByUnit } from '@/types/domain';
import { formatBr, saoPauloDateString, weekdayOf } from '@/utils/datetime';

import { CustomClassEditor, type CustomClassView } from './CustomClassEditor';
import { OneOffEditor, type OneOffView } from './OneOffEditor';
import { ScheduleEditor } from './ScheduleEditor';

export const metadata: Metadata = { title: 'Horários' };
export const dynamic = 'force-dynamic';

export default async function HorariosPage() {
  /*
   * O professor entra para remarcar o treino de hoje; a grade semanal é da
   * gestão. Duas telas seriam duas listas das mesmas turmas — aqui é a mesma
   * tela, e o bloco de cima só aparece para quem pode mexer na regra.
   */
  const admin = await requirePermission('aula_do_dia');
  const podeGrade = can(admin.role, 'horarios');

  const now = new Date();
  const today = saoPauloDateString(now);

  const scope = await getUnitScope();
  const classes = filterByUnit(await getEditableSchedule(), scope);

  /*
   * Turmas avulsas e quantos alunos cada uma alcança.
   *
   * O número não é enfeite: a aula é aberta a todo aluno ativo da unidade, e
   * ver "aberta a 34 alunos" antes de criar é o que diz ao professor que ele
   * não precisa pôr a aula na ficha de ninguém.
   */
  const [avulsasBrutas, ativos] = await Promise.all([
    listUpcomingOneOffClasses(now),
    listStudentsByStatus('ativo'),
  ]);

  const avulsas: OneOffView[] = filterByUnit(avulsasBrutas, scope).map((aula) => ({
    id: aula.id,
    dateLabel: formatBr(aula.date),
    weekdayLabel: weekdayLabels[weekdayOf(aula.date) as Weekday],
    startTime: aula.startTime,
    endTime: aula.endTime,
    title: aula.title,
    level: aula.level,
    teacher: aula.teacher,
    unit: aula.unit,
    isToday: aula.date === today,
    elegiveis: ativos.filter((student) => student.unit === aula.unit).length,
  }));

  // As exceções guardam só o id da turma. O título e o horário normal vêm da
  // grade aqui, e não do banco: turma renomeada aparece com o nome novo.
  const byId = new Map(classes.map((slot) => [slot.id, slot]));
  const overrides: CustomClassView[] = (await listUpcomingClassOverrides(now)).flatMap(
    (item): CustomClassView[] => {
      const slot = byId.get(item.classId);
      // Turma de outra academia no recorte atual, ou apagada da grade.
      if (!slot) return [];

      return [
        {
          id: item.id,
          classId: item.classId,
          classTitle: slot.title,
          dateLabel: formatBr(item.date),
          weekdayLabel: weekdayLabels[weekdayOf(item.date) as Weekday],
          startTime: item.startTime,
          endTime: item.endTime,
          normalTime: `${slot.startTime} às ${slot.endTime}`,
          canceled: item.canceled,
          note: item.note,
          isToday: item.date === today,
        },
      ];
    },
  );

  /*
   * O que cada turma tem de diferente nos próximos dias.
   *
   * A exceção morava só na lista de baixo, e a grade de cima seguia dizendo
   * "quinta, 18:30" como se nada houvesse. O professor que abre esta tela para
   * conferir o horário de hoje olha a grade, não a lista — a marca tem de
   * estar onde ele já está olhando.
   */
  const marks = overrides.reduce<Record<string, string[]>>((acc, item) => {
    const texto = item.canceled
      ? `${item.isToday ? 'Hoje' : item.dateLabel.slice(0, 5)}: cancelada`
      : `${item.isToday ? 'Hoje' : item.dateLabel.slice(0, 5)}: ${item.startTime}`;

    const atual = acc[item.classId];
    if (atual) atual.push(texto);
    else acc[item.classId] = [texto];
    return acc;
  }, {});

  return (
    <div className="page-stack">
      <PageHeader
        title={podeGrade ? 'Horários' : 'Aula de um dia'}
        meta={
          podeGrade
            ? 'Esta grade também define a janela de check-in de cada aluno.'
            : 'Remarque ou cancele o treino de um dia. A grade da semana é da gestão.'
        }
      />

      {podeGrade ? (
        <>
          <ScheduleEditor classes={classes} scope={scope} marks={marks} />

          {/*
            Régua antes das exceções: a grade acima é a regra, e o que vem
            abaixo são as quebras dela. Sem o corte, as duas listas de horário
            pareciam a mesma coisa continuando.
          */}
          <div className="border-t border-hairline pt-6">
            <CustomClassEditor
              classes={classes}
              overrides={overrides}
              today={today}
              scope={scope}
            />
          </div>

          <div className="border-t border-hairline pt-6">
            <OneOffEditor aulas={avulsas} today={today} scope={scope} />
          </div>
        </>
      ) : (
        <>
          <CustomClassEditor
            classes={classes}
            overrides={overrides}
            today={today}
            scope={scope}
          />

          <div className="border-t border-hairline pt-6">
            <OneOffEditor aulas={avulsas} today={today} scope={scope} />
          </div>
        </>
      )}
    </div>
  );
}
