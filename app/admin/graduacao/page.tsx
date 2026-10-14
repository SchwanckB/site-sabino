import type { Metadata } from 'next';

import type { KidsRow } from '@/components/admin/GraduationDashboard';
import { listCheckins } from '@/lib/repositories/attendance';
import { listStudentsByStatus } from '@/lib/repositories/students';
import {
  getAdultSummary,
  getKidsGraduationStatus,
  listEligibleKids,
  type AdultBelt,
  type AdultStudent,
  type AdultSummary,
  type KidsStudent,
} from '@/utils/graduationEngine';

import { GraduationClient } from './GraduationClient';

export const metadata: Metadata = { title: 'Graduação' };
export const dynamic = 'force-dynamic';

const ADULT_BELTS: readonly AdultBelt[] = ['branca', 'azul', 'roxa', 'marrom', 'preta'];

function toAdultBelt(belt: string): AdultBelt {
  return (ADULT_BELTS as readonly string[]).includes(belt) ? (belt as AdultBelt) : 'branca';
}

export default async function GraduacaoPage() {
  const now = new Date();
  const active = await listStudentsByStatus('ativo');

  // A trilha infantil é a que tem automação; a adulta é só informação.
  const kidsStudents: KidsStudent[] = active
    .filter((student) => student.category === 'kids' && student.birthDate.length > 0)
    .map((student) => ({
      id: student.id,
      name: student.name,
      birthDate: student.birthDate,
      joinedAt: student.joinedAt ?? student.createdAt,
      lastGraduationAt: student.lastGraduationAt,
      degree: student.degree,
      belt: student.belt,
    }));

  const byId = new Map(kidsStudents.map((student) => [student.id, student]));
  const kids: KidsRow[] = listEligibleKids(kidsStudents, now).flatMap((result) => {
    const student = byId.get(result.studentId);
    return student ? [{ student, result }] : [];
  });

  const adultRecords = active.filter(
    (student) => student.category === 'adulto' && student.birthDate.length > 0,
  );

  // Histórico de presenças em paralelo, para o painel adulto.
  const adults: AdultSummary[] = await Promise.all(
    adultRecords.map(async (student) => {
      const checkins = await listCheckins(student.id, 400);
      const adult: AdultStudent = {
        id: student.id,
        name: student.name,
        birthDate: student.birthDate,
        joinedAt: student.joinedAt ?? student.createdAt,
        lastGraduationAt: student.lastGraduationAt,
        belt: toAdultBelt(student.belt),
        degree: student.degree,
      };
      return getAdultSummary(adult, checkins.map((entry) => entry.date), now);
    }),
  );

  // Quem está esperando e quem já fechou os 12 graus, para o aviso do topo.
  const pendingCounts = kidsStudents.reduce<Record<string, number>>((acc, student) => {
    const { status } = getKidsGraduationStatus(student, now);
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});

  const readyForBelt = pendingCounts['PRONTO_PARA_AVALIACAO'] ?? 0;
  const toMigrate = pendingCounts['MIGRAR_PARA_ADULTO'] ?? 0;

  return (
    <div>
      {readyForBelt > 0 || toMigrate > 0 ? (
        <p
          role="note"
          className="mb-6 rounded-xl border border-dashed border-crimson/40 bg-crimson/[.06] px-4 py-3 text-xs leading-relaxed text-muted"
        >
          {readyForBelt > 0 ? (
            <>
              <strong className="text-foreground">{readyForBelt}</strong> aluno(s) completaram os
              12 graus e aguardam avaliação de faixa.{' '}
            </>
          ) : null}
          {toMigrate > 0 ? (
            <>
              <strong className="text-foreground">{toMigrate}</strong> completaram 16 anos e
              devem migrar para a categoria adulto.
            </>
          ) : null}
        </p>
      ) : null}

      <GraduationClient initialKids={kids} adults={adults} />
    </div>
  );
}
