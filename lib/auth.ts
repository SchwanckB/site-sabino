import 'server-only';

import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { isClerkConfigured } from '@/lib/env';

/**
 * Autorização por papel.
 *
 * O papel vive em `publicMetadata.role` no Clerk e é lido direto da fonte, não
 * do JWT da sessão — assim não depende de template configurado no painel.
 *
 * **Bootstrap do primeiro admin:** sem isso ninguém conseguiria aprovar o
 * próprio cadastro. Os e-mails listados em `ADMIN_EMAILS` são tratados como
 * ADMIN mesmo sem o metadado, o que permite entrar pela primeira vez e
 * promover os demais.
 */

export type Role = 'ADMIN' | 'ALUNO';

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: Role;
  readonly imageUrl: string | null;
}

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/** Usuário da sessão atual, ou `null` se não houver sessão. */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isClerkConfigured()) return null;

  const user = await currentUser();
  if (!user) return null;

  const email = user.primaryEmailAddress?.emailAddress?.toLowerCase() ?? '';
  const metadataRole = user.publicMetadata?.['role'];

  const role: Role =
    metadataRole === 'ADMIN' || adminEmails().includes(email) ? 'ADMIN' : 'ALUNO';

  const name =
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    user.username ||
    email ||
    'Aluno';

  return { id: user.id, email, name, role, imageUrl: user.imageUrl ?? null };
}

/** Exige sessão. Redireciona para o login quando não houver. */
export async function requireUser(): Promise<SessionUser> {
  if (!isClerkConfigured()) redirect('/configurar');

  const user = await getSessionUser();
  if (!user) redirect('/entrar');

  return user;
}

/**
 * Exige papel ADMIN. Um aluno que tentar abrir `/admin` vai para o painel
 * dele, não para uma tela de erro.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'ADMIN') redirect('/painel');

  return user;
}

export function isAdminEmail(email: string): boolean {
  return adminEmails().includes(email.toLowerCase());
}
