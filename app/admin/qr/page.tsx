import type { Metadata } from 'next';

import { qrTtlSeconds } from '@/lib/repositories/qr';
import { getSchedule } from '@/lib/schedule';
import { getUnitScope } from '@/lib/unitScope';
import { weekdayShortLabels, type Weekday } from '@/data/seed';
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
      openNow: abertas.has(slot.id),
    }))
    // Aula acontecendo agora no topo: é o que o professor quer ao abrir a tela.
    .sort((a, b) => {
      if (a.openNow !== b.openNow) return a.openNow ? -1 : 1;
      return a.label.localeCompare(b.label, 'pt-BR');
    });

  return (
    <div>
      <header>
        <p className="eyebrow">Recepção</p>
        <h1 className="mt-2 text-3xl leading-none sm:text-4xl">QR Code de presença</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Deixe esta tela aberta na entrada do tatame. Cada turma tem o seu código, e ele troca a
          cada {qrTtlSeconds()} segundos — é isso que impede alguém de registrar presença de casa
          com uma foto do QR.
        </p>
      </header>

      <div className="mt-10">
        <QrScreen turmas={turmas} />
      </div>
    </div>
  );
}
