import type { Metadata } from 'next';

import { PageHeader } from '@/components/app/PageHeader';
import { isQrSecretConfigured } from '@/lib/repositories/qr';
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
    <div className="page-stack">
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

      {/*
        Sem segredo próprio, o código do cartaz é derivado de uma constante que
        está no repositório — quem tem acesso ao código consegue calculá-lo e
        marcar presença de fora da academia, no horário da aula. O cartaz
        funciona, então isto é aviso e não bloqueio.
      */}
      {!isQrSecretConfigured() ? (
        <p
          role="note"
          className="mt-4 rounded-xl border border-amber-500/35 bg-amber-500/[.07] px-4 py-3 text-xs leading-relaxed text-amber-100 print:hidden"
        >
          <strong className="font-semibold">Falta configurar o QR_TOKEN_SECRET.</strong> Sem ele,
          o código destes cartazes pode ser calculado por quem tiver acesso ao código-fonte do
          site, o que permite marcar presença sem estar na academia. Crie a variável{' '}
          <code className="rounded bg-black/30 px-1">QR_TOKEN_SECRET</code> na Vercel com um texto
          aleatório de 16 caracteres ou mais e imprima os cartazes de novo.
        </p>
      ) : null}

      <QrScreen unidades={unidades} />
    </div>
  );
}
