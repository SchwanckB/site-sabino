import type { Metadata } from 'next';

import { AppShell, type NavItem, type PrimaryAction } from '@/components/app/AppShell';
import { requireStaff } from '@/lib/auth';
import { can, type Permission } from '@/lib/roles';
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
  const admin = await requireStaff();

  const scope = await getUnitScope();

  // O contador do menu segue o recorte: badge da rede inteira em cima de uma
  // tela filtrada por academia confunde mais do que ajuda. E só é lido por
  // quem pode abrir a fila — para o professor a página nem existe.
  const pendentes = can(admin.role, 'matricula')
    ? filterByUnit(await listStudentsByStatus('pendente'), scope).length
    : 0;

  /*
   * Quinze páginas em quatro blocos, filtradas pela permissão de quem entrou.
   *
   * A ordem é a do dia do professor, não a alfabética: o que ele abre no
   * tatame vem primeiro, a ficha do aluno depois, o dinheiro em seguida, e a
   * configuração por último — mexe-se nela uma vez por mês.
   *
   * O menu é a camada visível da permissão: o professor não vê porta que não
   * pode abrir, em vez de bater nela e levar um "isso é da gestão". Quem de
   * fato protege é a barreira de cada página e de cada server action — menu é
   * desenho, não trava.
   */
  const paginas: readonly (NavItem & { readonly needs?: Permission })[] = [
    { href: '/admin', label: 'Visão geral', short: 'Visão', icon: 'grafico', primary: true, group: 'Dia a dia' },
    { href: '/admin/aula', label: 'Modo aula', short: 'Aula', icon: 'presenca', group: 'Dia a dia', needs: 'aula' },
    { href: '/admin/presenca', label: 'Presença', icon: 'relogio', group: 'Dia a dia', needs: 'aula' },
    { href: '/admin/calendario', label: 'Calendário', short: 'Agenda', icon: 'calendario', primary: true, group: 'Dia a dia', needs: 'calendario' },

    { href: '/admin/alunos', label: 'Alunos', icon: 'alunos', primary: true, group: 'Alunos', needs: 'alunos' },
    { href: '/admin/aprovacoes', label: 'Aprovações', icon: 'aprovacao', badge: pendentes, group: 'Alunos', needs: 'matricula' },
    { href: '/admin/graduacao', label: 'Graduação', icon: 'faixa', group: 'Alunos', needs: 'alunos' },

    { href: '/admin/financeiro', label: 'Financeiro', icon: 'dinheiro', group: 'Dinheiro', needs: 'dinheiro' },
    { href: '/admin/caixa', label: 'Caixa', icon: 'grafico', group: 'Dinheiro', needs: 'dinheiro' },
    { href: '/admin/planos', label: 'Planos', icon: 'plano', group: 'Dinheiro', needs: 'dinheiro' },
    { href: '/admin/reajuste', label: 'Reajuste em lote', short: 'Reajuste', icon: 'dinheiro', group: 'Dinheiro', needs: 'dinheiro' },

    { href: '/admin/horarios', label: 'Horários', icon: 'horarios', group: 'Academia', needs: 'horarios' },
    { href: '/admin/relatorios', label: 'Relatórios', icon: 'grafico', group: 'Academia', needs: 'relatorios' },
    { href: '/admin/qr', label: 'QR da recepção', icon: 'qr', group: 'Academia', needs: 'aula' },
    { href: '/admin/contas', label: 'Contas', icon: 'conta', group: 'Academia', needs: 'contas' },
  ];

  const items: NavItem[] = paginas
    .filter((item) => item.needs === undefined || can(admin.role, item.needs))
    .map(({ needs, ...item }) => {
      void needs;
      return item;
    });

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

  // O título diz em qual painel a pessoa está. Gestão e professor entram pela
  // mesma porta e veem menus diferentes; sem isso, quem tem as duas contas não
  // sabe em qual entrou — e conclui que falta página, não que falta permissão.
  const titulo = admin.role === 'GESTAO' ? 'Gestão' : 'Professor';

  return (
    <AppShell
      items={items}
      title={titulo}
      primaryAction={primaryAction}
      unitScope={{ value: scope, action: setUnitScopeAction }}
    >
      {children}
    </AppShell>
  );
}
