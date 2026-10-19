import type { Metadata } from 'next';

import { PageHeader } from '@/components/app/PageHeader';

import { getSchedule } from '@/lib/schedule';
import { getUnitScope } from '@/lib/unitScope';
import { weekdayLabels, weekdayShortLabels, type Weekday } from '@/data/seed';
import { UNIT_SHORT, filterByUnit } from '@/types/domain';
import { findOpenClasses } from '@/utils/attendanceEngine';

import { QrScreen, type TurmaOption } from './QrScreen';

export const metadata: Metadata = { title: 'QR da recepção' };
export const dynamic = 'force-dynamic';

export default async function QrPage() {
  const now = new Date();
  const scope = await getUnitScope();
  const schedule = await getSchedule();

  const classes = filterByUnit(schedule.classes, scope);

  // `findOpenClasses` filtra por turmas atribuídas; aqui interessa a grade
  // toda, então passamos os ids de todas as aulas da academia.
  const abertas = new Set(
    findOpenClasses(classes, classes.map((slot) => slot.id), now).map((slot) => slot.classId),
  );

  const turmas: TurmaOption[] = classes
    .map((slot) => ({
      id: slot.id,
      label:
        `${weekdayShortLabels[slot.weekday as Weekday]} ${slot.startTime} · ${slot.title}` +
        (slot.level ? ` (${slot.level})` : '') +
        (scope === 'todas' ? ` · ${UNIT_SHORT[slot.unit]}` : ''),
      sublabel:
        `${weekdayLabels[slot.weekday as Weekday]}, ${slot.startTime} às ${slot.endTime}` +
        (slot.level ? ` · ${slot.level}` : '') +
        (scope === 'todas' ? ` · ${UNIT_SHORT[slot.unit]}` : ''),
      openNow: abertas.has(slot.id),
    }))
    // Aula acontecendo agora no topo: é o que o professor quer ao abrir a tela.
    .sort((a, b) => {
      if (a.openNow !== b.openNow) return a.openNow ? -1 : 1;
      return a.label.localeCompare(b.label, 'pt-BR');
    });

  return (
    <div>
      <PageHeader
        title="QR Code de presença"
        meta="Um cartaz por turma, para imprimir e colar na parede."
      />

      <div className="mt-6">
        <QrScreen turmas={turmas} />
      </div>
    </div>
  );
}
