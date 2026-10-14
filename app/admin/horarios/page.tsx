import type { Metadata } from 'next';

import { getEditableSchedule } from '@/lib/repositories/scheduleAdmin';

import { ScheduleEditor } from './ScheduleEditor';

export const metadata: Metadata = { title: 'Horários' };
export const dynamic = 'force-dynamic';

export default async function HorariosPage() {
  const classes = await getEditableSchedule();

  return (
    <div>
      <header>
        <p className="eyebrow">Grade da semana</p>
        <h1 className="mt-2 text-3xl leading-none sm:text-4xl">Horários</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Esta é a mesma grade que aparece no site. Alterações aqui também mudam a janela em que
          o check-in de cada aluno é aceito.
        </p>
      </header>

      <div className="mt-8">
        <ScheduleEditor classes={classes} />
      </div>
    </div>
  );
}
