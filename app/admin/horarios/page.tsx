import type { Metadata } from 'next';

import { PageHeader } from '@/components/app/PageHeader';

import { getEditableSchedule } from '@/lib/repositories/scheduleAdmin';
import { getUnitScope } from '@/lib/unitScope';
import { filterByUnit } from '@/types/domain';

import { ScheduleEditor } from './ScheduleEditor';

export const metadata: Metadata = { title: 'Horários' };
export const dynamic = 'force-dynamic';

export default async function HorariosPage() {
  const scope = await getUnitScope();
  const classes = filterByUnit(await getEditableSchedule(), scope);

  return (
    <div>
      <PageHeader
        title="Horários"
        meta="Esta grade também define a janela de check-in de cada aluno."
      />

      <div className="mt-8">
        <ScheduleEditor classes={classes} scope={scope} />
      </div>
    </div>
  );
}
