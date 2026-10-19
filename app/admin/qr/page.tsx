import type { Metadata } from 'next';

import { PageHeader } from '@/components/app/PageHeader';
import { getSchedule } from '@/lib/schedule';
import { getUnitScope } from '@/lib/unitScope';
import { UNITS, UNIT_LABELS, filterByUnit, type UnitId } from '@/types/domain';

import { QrScreen, type UnidadeOption } from './QrScreen';

export const metadata: Metadata = { title: 'QR da recepção' };
export const dynamic = 'force-dynamic';

export default async function QrPage() {
  const scope = await getUnitScope();
  const schedule = await getSchedule();

  // No recorte de uma academia, só o cartaz dela. Em "todas", os dois.
  const visiveis: readonly UnitId[] = scope === 'todas' ? UNITS : [scope];

  const unidades: UnidadeOption[] = visiveis.map((unit) => ({
    id: unit,
    label: UNIT_LABELS[unit],
    sublabel: 'Cartaz de presença',
    classCount: filterByUnit(schedule.classes, unit).length,
  }));

  const semGrade = unidades.filter((item) => item.classCount === 0);

  return (
    <div>
      <PageHeader
        title="QR Code de presença"
        meta="Um cartaz por academia, para imprimir e colar na parede."
      />

      {/*
        Sem grade não há horário de aula para validar, e todo check-in daquela
        unidade seria recusado. Avisar aqui evita imprimir um cartaz que não
        funciona.
      */}
      {semGrade.length > 0 ? (
        <p
          role="note"
          className="mt-4 rounded-xl border border-amber-500/35 bg-amber-500/[.07] px-4 py-3 text-xs leading-relaxed text-amber-100 print:hidden"
        >
          {semGrade.map((item) => item.label).join(' e ')}{' '}
          {semGrade.length === 1 ? 'ainda não tem' : 'ainda não têm'} turma cadastrada. Monte os
          horários antes de imprimir o cartaz — sem grade, o check-in é recusado por falta de
          aula para validar.
        </p>
      ) : null}

      <div className="mt-6">
        <QrScreen unidades={unidades} />
      </div>
    </div>
  );
}
