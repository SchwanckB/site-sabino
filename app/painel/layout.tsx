import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AppShell, type NavItem, type PrimaryAction } from '@/components/app/AppShell';
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
    { href: '/painel', label: 'Início', icon: 'inicio', primary: true },
    { href: '/painel#mensalidade', label: 'Mensalidade', short: 'Pagar', icon: 'dinheiro', primary: true },
    { href: '/painel#frequencia', label: 'Meus treinos', short: 'Treinos', icon: 'grafico' },
    { href: '/painel/ranking', label: 'Ranking', icon: 'trofeu', primary: true },
    { href: '/painel/checkin', label: 'Check-in', icon: 'qr' },
  ];

  // Professor que também treina precisa de um caminho de volta. Sem isto,
  // quem é promovido a professor entra na área do aluno e não encontra o
  // painel — parece que a promoção não funcionou.
  if (user.role === 'ADMIN') {
    items.push({
      href: '/admin',
      label: 'Painel do professor',
      short: 'Professor',
      icon: 'grafico',
    });
  }

  // O aluno abre o painel na porta da academia: o leitor de QR fica a um
  // toque, no centro da barra, e já sobe com a câmera ligada.
  const primaryAction: PrimaryAction = {
    href: '/painel/checkin?abrir=1',
    label: 'Marcar presença',
    short: 'Presença',
    icon: 'qr',
  };
  return (
    <AppShell items={items} title="Área do aluno" primaryAction={primaryAction}>
      {children}
    </AppShell>
  );
}
