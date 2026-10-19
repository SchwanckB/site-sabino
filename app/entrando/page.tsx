import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getSessionUser } from '@/lib/auth';
import { getStudent } from '@/lib/repositories/students';

export const metadata: Metadata = {
  title: 'Entrando',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Porta de entrada depois do login.
 *
 * O botão clicado na home ("sou aluno" / "sou professor") não decide para onde
 * a pessoa vai — quem decide é o papel da conta. Antes o login caía direto em
 * `/painel`, e um professor que também tem ficha de aluno ficava preso lá:
 * promover alguém a professor funcionava no Clerk, mas ele continuava entrando
 * na área do aluno e concluía, com razão, que a promoção não tinha pegado.
 *
 * Esta rota não desenha nada. Lê o papel e manda para o lugar certo.
 */
export default async function EntrandoPage() {
  const user = await getSessionUser();
  if (!user) redirect('/entrar');

  if (user.role === 'ADMIN') redirect('/admin');

  const student = await getStudent(user.id);
  if (!student) redirect('/onboarding');
  if (student.status !== 'ativo') redirect('/aguardando');

  redirect('/painel');
}
