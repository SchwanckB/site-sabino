import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AppShell, type NavItem, type PrimaryAction } from '@/components/app/AppShell';
import type { PanelChoice, ProfileChoice } from '@/components/app/ContextSwitcher';
import { resolveActiveProfile } from '@/lib/activeProfile';
import { getSessionUser } from '@/lib/auth';
import { isStaff } from '@/lib/roles';
import { getStudent } from '@/lib/repositories/students';
import { STATUS_LABELS } from '@/types/domain';

import { switchProfileAction } from './actions';

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

  const own = await getStudent(user.id);

  /*
   * O painel é do **perfil ativo**, não necessariamente de quem logou.
   *
   * Uma conta pode administrar mais de uma ficha: o pai treina nos adultos e
   * o filho de seis anos, sem e-mail, tem a ficha pendurada nela. Quem tem só
   * dependente e nenhuma ficha própria — o pai que não treina — também entra
   * aqui, e é por isso que a barreira olha o perfil resolvido e não `own`.
   */
  const perfil = await resolveActiveProfile(user.id, own);

  // Nenhuma ficha nesta conta: nem a própria, nem de dependente. Mandar o
  // professor para /onboarding seria absurdo — ele é o professor.
  if (!perfil) redirect(isStaff(user.role) ? '/admin' : '/onboarding');

  const student = perfil.student;

  /*
   * A própria ficha pendente é a sala de espera de sempre.
   *
   * A de um **dependente**, não: o pai está ativo e no meio do uso normal do
   * app, e mandá-lo para /aguardando seria tirá-lo da tela por causa da ficha
   * de outra pessoa. Esse caso é tratado abaixo, dentro da casca — ele clicou
   * no filho e tem de ver algo sobre o filho.
   */
  if (student.status !== 'ativo' && !perfil.isDependent) {
    redirect(isStaff(user.role) ? '/admin' : '/aguardando');
  }

  const aguardandoDependente = student.status !== 'ativo';

  const items: NavItem[] = [
    { href: '/painel', label: 'Início', icon: 'inicio', primary: true },
    { href: '/painel#mensalidade', label: 'Mensalidade', short: 'Pagar', icon: 'dinheiro', primary: true },
    { href: '/painel#frequencia', label: 'Meus treinos', short: 'Treinos', icon: 'grafico' },
    { href: '/painel/calendario', label: 'Calendário', short: 'Agenda', icon: 'calendario' },
    { href: '/painel/ranking', label: 'Ranking', icon: 'trofeu', primary: true },
    { href: '/painel/checkin', label: 'Check-in', icon: 'qr' },
  ];

  /*
   * Professor que também treina precisa de um caminho de volta.
   *
   * O item de menu continua aqui de propósito, embora o seletor do cabeçalho
   * também ofereça o painel do professor. Era por ele que quem foi promovido
   * encontrava o /admin, e tirar o caminho conhecido para pôr outro no lugar
   * é trocar um achado por um sumiço.
   */
  if (isStaff(user.role)) {
    items.push({
      href: '/admin',
      label: user.role === 'GESTAO' ? 'Painel da gestão' : 'Painel do professor',
      short: user.role === 'GESTAO' ? 'Gestão' : 'Professor',
      icon: 'grafico',
    });
  }

  /*
   * O seletor do cabeçalho: as fichas da conta e os painéis.
   *
   * As duas trocas moram no mesmo controle e nenhuma apaga a outra. O pai que
   * dá aula vê as fichas da família **e** o painel do professor; o aluno
   * sozinho que não dá aula não vê seletor nenhum, porque não há o que
   * trocar.
   */
  const profiles: ProfileChoice[] = perfil.profiles.map((item) => ({
    id: item.id,
    name: item.name,
    detail:
      item.id === user.id
        ? 'Você'
        : item.status === 'ativo'
          ? item.category === 'kids'
            ? 'Infantil'
            : 'Adulto'
          : STATUS_LABELS[item.status],
    active: item.id === student.id,
    ready: item.status === 'ativo',
  }));

  const panels: PanelChoice[] = [
    { href: '/painel', label: 'Área do aluno', icon: 'conta', active: true },
  ];

  if (isStaff(user.role)) {
    panels.push({
      href: '/admin',
      label: user.role === 'GESTAO' ? 'Painel da gestão' : 'Painel do professor',
      icon: 'grafico',
      active: false,
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
    <AppShell
      items={items}
      title="Área do aluno"
      primaryAction={primaryAction}
      context={{ profiles, panels, switchAction: switchProfileAction }}
    >
      {/*
        De quem é este painel, em toda tela.

        Antes isso só aparecia no `h1` da página inicial: no calendário, no
        ranking ou no check-in, o pai que tinha trocado para o perfil do filho
        não tinha como saber de quem era a tela que estava olhando. Numa tela
        que mostra mensalidade e data de vencimento, isso é sério.
      */}
      {perfil.isDependent ? (
        <p className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-accent/30 bg-accent/[.07] px-3.5 py-2.5 text-xs leading-relaxed text-foreground">
          <span className="font-semibold">Painel de {student.name.split(' ')[0]}</span>
          <span className="text-muted">
            Você está vendo a ficha de quem está na sua conta. Troque no seletor acima.
          </span>
        </p>
      ) : null}

      {/*
        O dependente que a recepção ainda não aprovou.
        
        O painel inteiro não serve para ele — não tem turma, nem mensalidade,
        nem frequência. Mas o pai clicou no nome do filho e merece uma
        resposta sobre o filho, em vez de ser devolvido ao próprio perfil ou
        jogado numa tela de espera que fala dele mesmo.
      */}
      {aguardandoDependente ? (
        <div className="panel px-6 py-12 text-center">
          <p className="font-display text-lg uppercase tracking-tight">
            {student.name.split(' ')[0]} está na fila
          </p>
          <p className="mx-auto mt-2 max-w-prose text-sm leading-relaxed text-muted">
            O cadastro foi enviado. A recepção confere os dados, define a turma e a
            mensalidade — e aí este painel abre com os treinos{' '}
            {student.gender === 'feminino' ? 'dela' : 'dele'}.
          </p>
          <p className="mt-4 text-xs text-muted">
            Enquanto isso, use o seletor acima para voltar ao seu perfil.
          </p>
        </div>
      ) : (
        children
      )}
    </AppShell>
  );
}
