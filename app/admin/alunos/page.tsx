import type { Metadata } from 'next';

import { PageHeader } from '@/components/app/PageHeader';

import { listAllStudents } from '@/lib/repositories/students';
import { getUnitScope } from '@/lib/unitScope';
import { filterByUnit } from '@/types/domain';
import { calculateAge } from '@/utils/graduationEngine';

import { StudentsList, type StudentRow } from './StudentsList';

export const metadata: Metadata = { title: 'Alunos' };
export const dynamic = 'force-dynamic';

export default async function AlunosPage() {
  const now = new Date();
  const scope = await getUnitScope();
  const students = filterByUnit(await listAllStudents(), scope);

  const rows: StudentRow[] = students
    .map((student) => ({
      id: student.id,
      name: student.name,
      email: student.email,
      age: student.birthDate ? calculateAge(student.birthDate, now) : 0,
      belt: student.belt,
      degree: student.degree,
      category: student.category,
      status: student.status,
      classCount: student.classIds.length,
      joinedAt: student.joinedAt,
      unit: student.unit,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return (
    <div>
      <PageHeader
        title="Alunos"
      />

      <div className="mt-8">
        <StudentsList rows={rows} scope={scope} />
      </div>
    </div>
  );
}
