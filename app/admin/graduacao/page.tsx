import type { Metadata } from 'next';

import { listCheckins } from '@/lib/repositories/attendance';
import { listStudentsByStatus } from '@/lib/repositories/students';
import {
  getAdultSummary,
  listKidsAgenda,
  type AdultBelt,
  type AdultStudent,
  type AdultSummary,
  type KidsStudent,
} from '@/utils/graduationEngine';

import { AdultsPanel } from './AdultsPanel';
import { KidsAgenda, type AgendaRow } from './KidsAgenda';
import { GraduationTabs } from './GraduationTabs';

export const metadata: Metadata = { title: 'Graduação' };
export const dynamic = 'force-dynamic';

const ADULT_BELTS: readonly AdultBelt[] = ['branca', 'azul', 'roxa', 'marrom', 'preta'];

function toAdultBelt(belt: string): AdultBelt {
  return (ADULT_BELTS as readonly string[]).includes(belt) ? (belt as AdultBelt) : 'branca';
}

export default async function GraduacaoPage() {
  const now = new Date();
  const active = await listStudentsByStatus('ativo');

  const kidsRecords = active.filter(
    (student) => student.category === 'kids' && student.birthDate.length > 0,
  );

  const kidsStudents: KidsStudent[] = kidsRecords.map((student) => ({
    id: student.id,
    name: student.name,
    birthDate: student.birthDate,
    joinedAt: student.joinedAt ?? student.createdAt,
    lastGraduationAt: student.lastGraduationAt,
    degree: student.degree,
    belt: student.belt,
  }));

  const byId = new Map(kidsRecords.map((student) => [student.id, student]));

  // A agenda devolve a turma inteira, não só quem já venceu.
  const rows: AgendaRow[] = listKidsAgenda(kidsStudents, now).flatMap((result) => {
    const student = byId.get(result.studentId);
    if (!student) return [];

    return [{
      id: student.id,
      name: student.name,
      age: result.age,
      gender: student.gender,
      belt: student.belt,
      degree: result.currentDegree,
      nextDegree: result.nextDegree,
      nextDegreeColor: result.nextDegreeColor,
      status: result.status,
      daysUntil: result.daysUntilEligible,
      daysSince: result.daysSinceLastGraduation,
      eligibleAt: result.eligibleAt,
      lastGraduationAt: result.anchorDate,
    }];
  });

  const adultRecords = active.filter(
    (student) => student.category === 'adulto' && student.birthDate.length > 0,
  );

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

  return (
    <div>
      <header>
        <p className="eyebrow">Graus e faixas</p>
        <h1 className="mt-2 text-3xl leading-none sm:text-4xl">Graduação</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Na trilha infantil o grau sai a cada 30 dias, então dá para planejar: a agenda mostra
          quem já está liberado e quando cada criança gradua. No adulto não há automação — a
          tabela reúne os dados para a sua decisão.
        </p>
      </header>

      <div className="mt-8">
        <GraduationTabs
          kids={<KidsAgenda rows={rows} />}
          adults={<AdultsPanel adults={adults} />}
          kidsCount={rows.filter((r) => r.status === 'ELEGIVEL').length}
          adultsCount={adults.length}
        />
      </div>
    </div>
  );
}
