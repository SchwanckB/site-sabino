import type { Metadata } from 'next';

import { PageHeader } from '@/components/app/PageHeader';

import { weekdayLabels, type Weekday } from '@/data/seed';
import { listUpcomingClassOverrides } from '@/lib/repositories/classOverrides';
import { getEditableSchedule } from '@/lib/repositories/scheduleAdmin';
import { getUnitScope } from '@/lib/unitScope';
import { filterByUnit } from '@/types/domain';
import { formatBr, saoPauloDateString, weekdayOf } from '@/utils/datetime';

import { CustomClassEditor, type CustomClassView } from './CustomClassEditor';
import { ScheduleEditor } from './ScheduleEditor';

export const metadata: Metadata = { title: 'Horários' };
export const dynamic = 'force-dynamic';

export default async function HorariosPage() {
  const now = new Date();
  const today = saoPauloDateString(now);

  const scope = await getUnitScope();
  const classes = filterByUnit(await getEditableSchedule(), scope);

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

  return (
    <div>
      <PageHeader
        title="Horários"
        meta="Esta grade também define a janela de check-in de cada aluno."
      />

      <div className="mt-8">
        <ScheduleEditor classes={classes} scope={scope} />
      </div>

      <div className="mt-12 border-t border-hairline pt-8">
        <CustomClassEditor
          classes={classes}
          overrides={overrides}
          today={today}
          scope={scope}
        />
      </div>
    </div>
  );
}
