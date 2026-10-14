import 'server-only';

import { clerkClient } from '@clerk/nextjs/server';

import { isAdminEmail } from '@/lib/auth';
import { isClerkConfigured } from '@/lib/env';
import { getStudents } from '@/lib/repositories/students';
import type { Role } from '@/lib/auth';
import type { UserStatus } from '@/types/domain';

/**
 * Contas de acesso.
 *
 * A fonte de verdade de "quem consegue entrar" é o Clerk, não o Redis: alguém
 * pode criar a conta e abandonar a ficha, e essas pessoas ficariam invisíveis
 * numa listagem que partisse só do banco. Aqui o Clerk é a base e a ficha do
 * Redis entra como complemento — o que torna visível justamente quem travou no
 * meio do cadastro.
 */

export interface Account {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly imageUrl: string | null;
  readonly role: Role;
  /**
   * `true` quando o papel de ADMIN vem de `ADMIN_EMAILS`. Nesse caso ele não
   * pode ser removido pela interface — só editando a variável de ambiente.
   */
  readonly roleFromEnv: boolean;
  /** Situação da ficha, ou `null` se a pessoa nunca preencheu o cadastro. */
  readonly enrollmentStatus: UserStatus | null;
  readonly createdAt: string;
  readonly lastSignInAt: string | null;
}

const PAGE_SIZE = 100;
const MAX_ACCOUNTS = 500;

function displayName(
  first: string | null,
  last: string | null,
  username: string | null,
  email: string,
): string {
  const full = [first, last].filter(Boolean).join(' ').trim();
  return full || username || email || 'Sem nome';
}

/** Todas as contas, com papel e situação da matrícula. */
export async function listAccounts(): Promise<Account[]> {
  if (!isClerkConfigured()) return [];

  const client = await clerkClient();

  const users: Awaited<ReturnType<typeof client.users.getUserList>>['data'] = [];
  for (let offset = 0; offset < MAX_ACCOUNTS; offset += PAGE_SIZE) {
    const page = await client.users.getUserList({
      limit: PAGE_SIZE,
      offset,
      orderBy: '-created_at',
    });

    users.push(...page.data);
    if (page.data.length < PAGE_SIZE) break;
  }

  // Uma leitura só do Redis para todas as fichas.
  const students = await getStudents(users.map((user) => user.id));
  const byId = new Map(students.map((student) => [student.id, student]));

  return users.map((user) => {
    const email = user.primaryEmailAddress?.emailAddress ?? '';
    const metadataRole = user.publicMetadata?.['role'];
    const fromEnv = email.length > 0 && isAdminEmail(email);
    const role: Role = metadataRole === 'ADMIN' || fromEnv ? 'ADMIN' : 'ALUNO';

    return {
      id: user.id,
      name: displayName(user.firstName, user.lastName, user.username, email),
      email,
      imageUrl: user.imageUrl ?? null,
      role,
      roleFromEnv: fromEnv,
      enrollmentStatus: byId.get(user.id)?.status ?? null,
      createdAt: new Date(user.createdAt).toISOString(),
      lastSignInAt: user.lastSignInAt ? new Date(user.lastSignInAt).toISOString() : null,
    };
  });
}

export type RoleChangeResult =
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly message: string };

/**
 * Promove a professor (ADMIN) ou devolve a aluno.
 *
 * O papel vive em `publicMetadata.role` no Clerk, lido a cada requisição por
 * `getSessionUser()` — a mudança vale no próximo carregamento de página, sem
 * precisar de novo deploy.
 */
export async function setAccountRole(
  targetUserId: string,
  role: Role,
): Promise<RoleChangeResult> {
  if (!isClerkConfigured()) {
    return { ok: false, message: 'Autenticação não configurada.' };
  }

  const client = await clerkClient();

  let email = '';
  try {
    const user = await client.users.getUser(targetUserId);
    email = user.primaryEmailAddress?.emailAddress ?? '';
  } catch {
    return { ok: false, message: 'Conta não encontrada.' };
  }

  // Rebaixar não adianta se o ADMIN vem da variável de ambiente: o próximo
  // login recalcularia o papel a partir dela. Melhor recusar e explicar.
  if (role === 'ALUNO' && email.length > 0 && isAdminEmail(email)) {
    return {
      ok: false,
      message:
        'Este e-mail está em ADMIN_EMAILS e continuaria como professor. Remova-o da variável de ambiente na Vercel primeiro.',
    };
  }

  try {
    await client.users.updateUserMetadata(targetUserId, {
      publicMetadata: { role },
    });
  } catch (error) {
    console.error('[accounts] falha ao alterar o papel', error);
    return { ok: false, message: 'Não foi possível alterar o acesso. Tente novamente.' };
  }

  return {
    ok: true,
    message:
      role === 'ADMIN'
        ? 'Conta promovida a professor. O acesso ao painel vale no próximo carregamento.'
        : 'Conta voltou a ser de aluno.',
  };
}
