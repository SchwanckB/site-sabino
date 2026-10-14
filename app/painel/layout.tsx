import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AppShell, type NavItem } from '@/components/app/AppShell';
import { getSessionUser } from '@/lib/auth';
import { getStudent } from '@/lib/repositories/students';

export const metadata: Metadata = {
  title: { default: 'Meu painel', template: '%s | Sabino' },
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function PainelLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  if (!user) redirect('/entrar');

  const student = await getStudent(user.id);

  // Professor que também treina tem ficha e vê o painel normalmente. Sem
  // ficha, mandá-lo para /onboarding seria absurdo — ele é o professor.
  if (user.role === 'ADMIN') {
    if (!student || student.status !== 'ativo') redirect('/admin');
  } else {
    if (!student) redirect('/onboarding');
    if (student.status !== 'ativo') redirect('/aguardando');
  }

  const items: NavItem[] = [
    { href: '/painel', label: 'Meu painel' },
    { href: '/painel/checkin', label: 'Check-in' },
  ];

  return (
    <AppShell items={items} title="Área do aluno">
      {children}
    </AppShell>
  );
}
