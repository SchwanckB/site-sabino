import type { Metadata } from 'next';

import type { KidsRow } from '@/components/admin/GraduationDashboard';
import { buildDemoAdults, buildDemoKids } from '@/data/demoStudents';
import {
  getAdultSummary,
  getKidsGraduationStatus,
  listEligibleKids,
  type AdultSummary,
} from '@/utils/graduationEngine';

import { GraduationPreview } from './GraduationPreview';

/**
 * Preview do painel de graduacao com dados ficticios.
 *
 * ATENCAO - esta rota ainda NAO esta protegida. Antes de ir para producao ela
 * precisa do middleware do Clerk exigindo `publicMetadata.role === 'ADMIN'`.
 * Enquanto isso, ela so serve dados de demonstracao de `data/demoStudents.ts`
 * e e marcada como `noindex`.
 */
export const metadata: Metadata = {
  title: 'Graduacao (preview)',
  robots: { index: false, follow: false },
};

/** Sempre recalcula: a elegibilidade depende da data de hoje. */
export const dynamic = 'force-dynamic';

export default function GraduationPreviewPage() {
  const now = new Date();

  const students = buildDemoKids(now);

  // `listEligibleKids` ja filtra e ordena; aqui so recuperamos o aluno de cada
  // resultado para montar as linhas do dashboard.
  const byId = new Map(students.map((student) => [student.id, student]));
  const kids: KidsRow[] = listEligibleKids(students, now).flatMap((result) => {
    const student = byId.get(result.studentId);
    return student ? [{ student, result }] : [];
  });

  const adults: AdultSummary[] = buildDemoAdults(now).map(({ student, checkins }) =>
    getAdultSummary(student, checkins, now),
  );

  // Contagem por status, so para o aviso de demonstracao no topo.
  const statusCounts = students.reduce<Record<string, number>>((acc, student) => {
    const { status } = getKidsGraduationStatus(student, now);
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="min-h-dvh bg-ink px-5 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto w-full max-w-6xl">
        <p
          role="note"
          className="mb-8 rounded-xl border border-dashed border-crimson/40 bg-crimson/[.06] px-4 py-3 text-xs leading-relaxed text-muted"
        >
          <strong className="text-foreground">Preview com dados fictícios.</strong>{' '}
          {students.length} crianças de exemplo:{' '}
          {Object.entries(statusCounts)
            .map(([status, count]) => `${count} ${status}`)
            .join(', ')}
          . Rota ainda sem proteção de autenticação — restringir ao papel ADMIN antes de
          publicar.
        </p>

        <GraduationPreview initialKids={kids} adults={adults} />
      </div>
    </main>
  );
}
