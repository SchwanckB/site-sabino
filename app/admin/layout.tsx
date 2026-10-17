import type { Metadata } from 'next';

import { AppShell, type NavItem, type PrimaryAction } from '@/components/app/AppShell';
import { requireAdmin } from '@/lib/auth';
import { listStudentsByStatus } from '@/lib/repositories/students';
import { getUnitScope } from '@/lib/unitScope';
import { filterByUnit } from '@/types/domain';

import { setUnitScopeAction } from './actions';

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

  const scope = await getUnitScope();
  // O contador do menu segue o recorte: badge da rede inteira em cima de uma
  // tela filtrada por academia confunde mais do que ajuda.
  const pendentes = filterByUnit(await listStudentsByStatus('pendente'), scope).length;

  const items: NavItem[] = [
    { href: '/admin', label: 'Visão geral', short: 'Visão', icon: 'grafico', primary: true },
    { href: '/admin/alunos', label: 'Alunos', icon: 'alunos', primary: true },
    { href: '/admin/aprovacoes', label: 'Aprovações', icon: 'aprovacao', badge: pendentes },
    { href: '/admin/aula', label: 'Modo aula', short: 'Aula', icon: 'presenca' },
    { href: '/admin/presenca', label: 'Presença', icon: 'relogio' },
    { href: '/admin/calendario', label: 'Calendário', short: 'Agenda', icon: 'calendario', primary: true },
    { href: '/admin/financeiro', label: 'Financeiro', icon: 'dinheiro' },
    { href: '/admin/graduacao', label: 'Graduação', icon: 'faixa' },
    { href: '/admin/horarios', label: 'Horários', icon: 'horarios' },
    { href: '/admin/relatorios', label: 'Relatórios', icon: 'grafico' },
    { href: '/admin/planos', label: 'Planos', icon: 'plano' },
    { href: '/admin/qr', label: 'QR da recepção', icon: 'qr' },
    { href: '/admin/contas', label: 'Contas', icon: 'conta' },
  ];

  // A ação do dia a dia do professor: abrir a aula que está começando.
  const primaryAction: PrimaryAction = {
    href: '/admin/aula',
    label: 'Abrir a aula',
    short: 'Aula',
    icon: 'presenca',
  };
  return (
    <AppShell
      items={items}
      title="Administração"
      primaryAction={primaryAction}
      unitScope={{ value: scope, action: setUnitScopeAction }}
    >
      {children}
    </AppShell>
  );
}
