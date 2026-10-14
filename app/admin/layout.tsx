import type { Metadata } from 'next';

import { AppShell, type NavItem } from '@/components/app/AppShell';
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
    { href: '/admin', label: 'Visão geral' },
    { href: '/admin/aprovacoes', label: 'Aprovações', badge: counts.pendente },
    { href: '/admin/alunos', label: 'Alunos' },
    { href: '/admin/presenca', label: 'Presença' },
    { href: '/admin/financeiro', label: 'Financeiro' },
    { href: '/admin/graduacao', label: 'Graduação' },
    { href: '/admin/horarios', label: 'Horários' },
    { href: '/admin/qr', label: 'QR da recepção' },
    { href: '/admin/contas', label: 'Contas' },
  ];

  return (
    <AppShell items={items} title="Administração">
      {children}
    </AppShell>
  );
}
