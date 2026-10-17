import type { Metadata } from 'next';

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
      <header>
        <p className="eyebrow">Grade da semana</p>
        <h1 className="mt-2 text-3xl leading-none sm:text-4xl">Horários</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Esta é a mesma grade que aparece no site. Alterações aqui também mudam a janela em que
          o check-in de cada aluno é aceito. Cada turma pertence a uma academia — troque o
          recorte no topo da página para ver a grade da outra.
        </p>
      </header>

      <div className="mt-8">
        <ScheduleEditor classes={classes} scope={scope} />
      </div>
    </div>
  );
}
