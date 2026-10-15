import type { Metadata } from 'next';

import { AppShell, type NavItem, type PrimaryAction } from '@/components/app/AppShell';
import { requireAdmin } from '@/lib/auth';
import { countByStatus } from '@/lib/repositories/students';

export const metadata: Metadata = {
  title: { default: 'Administração', template: '%s | Admin Sabino' },
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Barreira de papel. O middleware só garante que existe sessão.
  await requireAdmin();

  const counts = await countByStatus();

  const items: NavItem[] = [
    { href: '/admin', label: 'Visão geral', short: 'Visão', icon: 'grafico', primary: true },
    { href: '/admin/alunos', label: 'Alunos', icon: 'alunos', primary: true },
    { href: '/admin/aprovacoes', label: 'Aprovações', icon: 'aprovacao', badge: counts.pendente },
    { href: '/admin/presenca', label: 'Presença', icon: 'presenca' },
    { href: '/admin/calendario', label: 'Calendário', short: 'Agenda', icon: 'calendario', primary: true },
    { href: '/admin/financeiro', label: 'Financeiro', icon: 'dinheiro' },
    { href: '/admin/graduacao', label: 'Graduação', icon: 'faixa' },
    { href: '/admin/horarios', label: 'Horários', icon: 'horarios' },
    { href: '/admin/planos', label: 'Planos', icon: 'plano' },
    { href: '/admin/qr', label: 'QR da recepção', icon: 'qr' },
    { href: '/admin/contas', label: 'Contas', icon: 'conta' },
  ];

  // A ação do dia a dia do professor: marcar quem treinou.
  const primaryAction: PrimaryAction = {
    href: '/admin/presenca',
    label: 'Marcar presença',
    short: 'Presença',
    icon: 'presenca',
  };
  return (
    <AppShell items={items} title="Administração" primaryAction={primaryAction}>
      {children}
    </AppShell>
  );
}
