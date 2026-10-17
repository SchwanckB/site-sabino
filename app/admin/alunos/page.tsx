import type { Metadata } from 'next';

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
      <header>
        <p className="eyebrow">Cadastro</p>
        <h1 className="mt-2 text-3xl leading-none sm:text-4xl">Alunos</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Abra a ficha de um aluno para ajustar turmas, faixa, graus, mensalidade e situação.
        </p>
      </header>

      <div className="mt-8">
        <StudentsList rows={rows} scope={scope} />
      </div>
    </div>
  );
}
