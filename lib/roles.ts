/**
 * Papéis e permissões — fonte única, sem I/O.
 *
 * Mora fora de `lib/auth.ts` de propósito: aquele módulo é `server-only`, e a
 * tela de contas precisa dos mesmos rótulos e da mesma tabela no cliente para
 * desenhar o que cada papel pode. Duas cópias da tabela seriam duas chances de
 * a interface prometer um acesso que o servidor recusa.
 *
 * São três papéis e dois níveis de painel:
 *
 *   GESTAO    — administra a academia: dinheiro, grade, planos e acessos.
 *   PROFESSOR — o dia a dia do tatame: aula, presença, QR, ficha e graduação.
 *   ALUNO     — só o painel dele.
 *
 * Professor e gestão entram pela **mesma porta** (`/admin`). O que muda é o
 * que aparece no menu e o que as ações aceitam.
 */

export type Role = 'GESTAO' | 'PROFESSOR' | 'ALUNO';

export const ROLES: readonly Role[] = ['GESTAO', 'PROFESSOR', 'ALUNO'];

/**
 * O que uma pessoa pode fazer no painel.
 *
 * Nomeado por assunto, e não por tela: a mesma permissão cobre a página, as
 * server actions que ela dispara e a rota de API equivalente. Quando uma tela
 * nova entrar no mesmo assunto, ela já nasce protegida.
 */
export type Permission =
  /** Modo aula, presença manual, QR da recepção, diário da aula. */
  | 'aula'
  /** Lista e ficha do aluno, turmas, faixa e graus. */
  | 'alunos'
  /** Eventos do calendário da academia. */
  | 'calendario'
  /** Aprovar, recusar, mudar a situação e apagar cadastro. */
  | 'matricula'
  /** Financeiro, caixa, planos, mensalidade e reajuste. */
  | 'dinheiro'
  /** Grade de horários — a regra semanal da academia. */
  | 'horarios'
  /**
   * Aula de um dia só: remarcar para outro horário, ou cancelar.
   *
   * Separada de `horarios` porque são decisões de tamanho diferente. Mudar a
   * grade muda a janela de check-in de todo mundo, toda semana, e aparece no
   * site — é da gestão. "Hoje o MMA é mais cedo" é o professor resolvendo o
   * dia dele, e ele precisa resolver isso no tatame, não pedindo para alguém.
   */
  | 'aula_do_dia'
  /** Frequência por turma e as planilhas para baixar. */
  | 'relatorios'
  /** Quem entra no painel e com qual permissão. */
  | 'contas';

const GESTAO_PERMISSIONS: readonly Permission[] = [
  'aula',
  'alunos',
  'calendario',
  'matricula',
  'dinheiro',
  'horarios',
  'aula_do_dia',
  'relatorios',
  'contas',
];

/*
 * O professor fica com o tatame.
 *
 * Fora da lista estão as coisas que custam dinheiro ou mudam a regra da
 * academia: mensalidade (incluindo a aprovação da matrícula, que define o
 * valor), a grade de horários e os acessos. Relatórios saem junto porque a
 * planilha de financeiro está lá e as outras duas levam dado pessoal do aluno
 * para fora do sistema.
 *
 * `aula_do_dia` entra, e `horarios` não: remarcar o treino de hoje é decisão
 * que ele toma no tatame, com a turma esperando. Mudar a grade semanal é
 * outra conversa — muda a janela de check-in de todo mundo e aparece no site.
 */
const PROFESSOR_PERMISSIONS: readonly Permission[] = [
  'aula',
  'alunos',
  'calendario',
  'aula_do_dia',
];

const BY_ROLE: Readonly<Record<Role, readonly Permission[]>> = {
  GESTAO: GESTAO_PERMISSIONS,
  PROFESSOR: PROFESSOR_PERMISSIONS,
  ALUNO: [],
};

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  GESTAO: 'Gestão',
  PROFESSOR: 'Professor',
  ALUNO: 'Aluno',
};

/** Uma linha explicando o papel, para a tela de contas. */
export const ROLE_HINTS: Readonly<Record<Role, string>> = {
  GESTAO:
    'Vê e mexe em tudo: dinheiro, caixa, planos, grade de horários e os acessos das outras contas.',
  PROFESSOR:
    'O tatame: abre aula, lança presença, mostra o QR, cuida da ficha e registra graduação. Não vê dinheiro.',
  ALUNO: 'Só o painel dele: check-in, frequência, graduação e mensalidade.',
};

export function can(role: Role, permission: Permission): boolean {
  return BY_ROLE[role].includes(permission);
}

/** `true` para quem entra em `/admin` — professor ou gestão. */
export function isStaff(role: Role): boolean {
  return role === 'GESTAO' || role === 'PROFESSOR';
}

export function permissionsOf(role: Role): readonly Permission[] {
  return BY_ROLE[role];
}

/**
 * Papel gravado em `publicMetadata.role` no Clerk, normalizado.
 *
 * **Legado:** até existirem dois níveis, todo professor promovido era gravado
 * como `ADMIN`. Essas contas viram PROFESSOR, e não gestão — é o lado seguro
 * da conversão, e quem precisa do acesso completo é promovido em um clique na
 * tela de contas. A gestão de partida vem de `ADMIN_EMAILS`, que não depende
 * deste metadado (ver `lib/auth.ts`).
 */
export function normalizeRole(value: unknown): Role | null {
  if (value === 'GESTAO' || value === 'PROFESSOR' || value === 'ALUNO') return value;
  if (value === 'ADMIN') return 'PROFESSOR';
  return null;
}

export function isRole(value: unknown): value is Role {
  return value === 'GESTAO' || value === 'PROFESSOR' || value === 'ALUNO';
}
