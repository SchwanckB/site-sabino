import 'server-only';

import { cookies } from 'next/headers';

import { listDependents } from '@/lib/repositories/students';
import type { StudentRecord } from '@/types/domain';

/**
 * Qual ficha o painel do aluno está mostrando.
 *
 * Uma conta pode administrar mais de uma ficha: o pai treina nos adultos e o
 * filho de seis anos, que não tem e-mail, tem a ficha pendurada na conta
 * dele. O seletor é o mesmo gesto que já existe entre "meu painel de aluno" e
 * "painel do professor" — muda de quem é a tela, não de quem está logado.
 *
 * **O cookie é um palpite, nunca uma credencial.** Ele carrega um id, e id
 * vindo do navegador não decide nada: `resolveActiveProfile` confere contra a
 * própria ficha e contra os dependentes daquela conta antes de devolver. Um
 * cookie forjado com o id de outro aluno cai no perfil próprio, em silêncio.
 */

const COOKIE_SEGURO = '__Host-sabino_perfil';
const COOKIE_SIMPLES = 'sabino_perfil';
const UM_ANO = 60 * 60 * 24 * 365;

const emProducao = (): boolean => process.env.NODE_ENV === 'production';
const nomeDoCookie = (): string => (emProducao() ? COOKIE_SEGURO : COOKIE_SIMPLES);

export interface ActiveProfile {
  /** A ficha que a tela deve mostrar. */
  readonly student: StudentRecord;
  /** `true` quando é um dependente, e não a ficha de quem está logado. */
  readonly isDependent: boolean;
  /** Todas as fichas desta conta, para montar o seletor. Inclui a própria. */
  readonly profiles: readonly StudentRecord[];
}

/**
 * Resolve o perfil ativo da conta.
 *
 * `own` é a ficha de quem está logado, ou `null` para o professor que não
 * treina — nesse caso o painel do aluno só existe se houver dependente, que é
 * justamente o pai que não treina e só acompanha o filho.
 */
export async function resolveActiveProfile(
  userId: string,
  own: StudentRecord | null,
): Promise<ActiveProfile | null> {
  const dependentes = await listDependents(userId);
  const profiles = own ? [own, ...dependentes] : dependentes;

  if (profiles.length === 0) return null;

  const store = await cookies();
  const escolhido = store.get(nomeDoCookie())?.value ?? store.get(COOKIE_SIMPLES)?.value;

  // Id que não está na lista desta conta é descartado sem alarde: cookie
  // velho de um dependente apagado é o caso comum, e não vale uma tela de
  // erro. O primeiro perfil é sempre o próprio, quando existe.
  const student = profiles.find((item) => item.id === escolhido) ?? profiles[0];
  if (!student) return null;

  return { student, isDependent: student.id !== userId, profiles };
}

/**
 * Troca o perfil mostrado.
 *
 * Não valida aqui: quem valida é a leitura, a cada requisição. Gravar um id
 * qualquer no cookie não dá acesso a nada — ele é descartado na volta.
 */
export async function setActiveProfile(studentId: string): Promise<void> {
  const store = await cookies();
  store.set(nomeDoCookie(), studentId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: emProducao(),
    path: '/',
    maxAge: UM_ANO,
  });
}
