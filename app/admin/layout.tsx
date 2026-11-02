import type { Metadata } from 'next';

import { AppShell, type NavItem, type PrimaryAction } from '@/components/app/AppShell';
import { requireAdmin } from '@/lib/auth';
import { getStudent, listStudentsByStatus } from '@/lib/repositories/students';
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
  const admin = await requireAdmin();

  const scope = await getUnitScope();
  // O contador do menu segue o recorte: badge da rede inteira em cima de uma
  // tela filtrada por academia confunde mais do que ajuda.
  const pendentes = filterByUnit(await listStudentsByStatus('pendente'), scope).length;

  /*
   * Quatorze páginas em quatro blocos.
   *
   * A ordem é a do dia do professor, não a alfabética: o que ele abre no
   * tatame vem primeiro, a ficha do aluno depois, o dinheiro em seguida, e a
   * configuração por último — mexe-se nela uma vez por mês.
   */
  const items: NavItem[] = [
    { href: '/admin', label: 'Visão geral', short: 'Visão', icon: 'grafico', primary: true, group: 'Dia a dia' },
    { href: '/admin/aula', label: 'Modo aula', short: 'Aula', icon: 'presenca', group: 'Dia a dia' },
    { href: '/admin/presenca', label: 'Presença', icon: 'relogio', group: 'Dia a dia' },
    { href: '/admin/calendario', label: 'Calendário', short: 'Agenda', icon: 'calendario', primary: true, group: 'Dia a dia' },

    { href: '/admin/alunos', label: 'Alunos', icon: 'alunos', primary: true, group: 'Alunos' },
    { href: '/admin/aprovacoes', label: 'Aprovações', icon: 'aprovacao', badge: pendentes, group: 'Alunos' },
    { href: '/admin/graduacao', label: 'Graduação', icon: 'faixa', group: 'Alunos' },

    { href: '/admin/financeiro', label: 'Financeiro', icon: 'dinheiro', group: 'Dinheiro' },
    { href: '/admin/planos', label: 'Planos', icon: 'plano', group: 'Dinheiro' },

    { href: '/admin/horarios', label: 'Horários', icon: 'horarios', group: 'Academia' },
    { href: '/admin/relatorios', label: 'Relatórios', icon: 'grafico', group: 'Academia' },
    { href: '/admin/qr', label: 'QR da recepção', icon: 'qr', group: 'Academia' },
    { href: '/admin/contas', label: 'Contas', icon: 'conta', group: 'Academia' },
  ];

  // O professor que treina usa o painel do aluno para o próprio check-in.
  // O caminho tem de existir nos dois sentidos.
  const ficha = await getStudent(admin.id);
  if (ficha?.status === 'ativo') {
    items.push({
      href: '/painel',
      label: 'Meu painel de aluno',
      short: 'Aluno',
      icon: 'inicio',
      // Bloco próprio: não é administração da academia, é a ficha dele.
      group: 'Como aluno',
    });
  }

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
