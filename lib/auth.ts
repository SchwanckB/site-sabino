import 'server-only';

import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { isClerkConfigured } from '@/lib/env';
import { can, isStaff, normalizeRole, type Permission, type Role } from '@/lib/roles';

/**
 * Autorização.
 *
 * O papel vive em `publicMetadata.role` no Clerk e é lido direto da fonte, não
 * do JWT da sessão — assim não depende de template configurado no painel.
 *
 * **Bootstrap da gestão:** sem isso ninguém conseguiria aprovar o próprio
 * cadastro nem promover os demais. Os e-mails listados em `ADMIN_EMAILS` são
 * tratados como GESTAO mesmo sem o metadado, o que garante que a academia
 * nunca fique sem quem administra — nem que a própria tela de contas tranque
 * a porta por fora.
 *
 * A tabela de quem pode o quê está em `lib/roles.ts`, que o cliente também
 * importa. Aqui ficam só as três formas de cobrá-la:
 *
 *   `requireStaff()`             — barreira do `/admin` inteiro.
 *   `requirePermission(p)`       — barreira de uma página.
 *   `authorize(p)`               — barreira de uma server action.
 */

export type { Permission, Role } from '@/lib/roles';

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: Role;
  readonly imageUrl: string | null;
}

function gestaoEmails(): string[] {
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

  // O ambiente vence o metadado: é a trava que mantém o dono da academia com
  // acesso completo mesmo se alguém o rebaixar por engano na tela de contas.
  const role: Role = gestaoEmails().includes(email)
    ? 'GESTAO'
    : (normalizeRole(user.publicMetadata?.['role']) ?? 'ALUNO');

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
 * Exige acesso ao painel da academia — professor ou gestão.
 *
 * Um aluno que tentar abrir `/admin` vai para o painel dele, não para uma tela
 * de erro.
 */
export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isStaff(user.role)) redirect('/painel');

  return user;
}

/**
 * Exige uma permissão específica para abrir a página.
 *
 * Professor que digitar `/admin/caixa` na barra de endereço cai na visão geral
 * — e não num 403. A página não está no menu dele; chegar nela é acidente de
 * link antigo ou histórico do navegador, e o certo é devolvê-lo ao painel que
 * ele conhece.
 */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireStaff();
  if (!can(user.role, permission)) redirect('/admin');

  return user;
}

export type Authorization =
  | { readonly ok: true; readonly user: SessionUser }
  | { readonly ok: false; readonly message: string };

/**
 * Barreira das server actions.
 *
 * Server Actions são endpoints HTTP públicos: sem esta checagem, qualquer
 * pessoa com o ID da action poderia quitar mensalidade ou mexer na grade.
 *
 * ```ts
 * const auth = await authorize('dinheiro');
 * if (!auth.ok) return auth;
 * ```
 *
 * Os dois modos de recusa são de propósito:
 *
 *   **Sem sessão, ou aluno** — redireciona, como numa página. Não há mensagem
 *   útil a dar: ou a sessão morreu, ou é alguém chamando a action por fora, e
 *   nos dois casos explicar a regra não ajuda.
 *
 *   **Professor sem a permissão** — devolve a recusa no formato que
 *   `ActionForm` já sabe mostrar. Aqui a pessoa é da casa e cometeu um erro
 *   honesto (link antigo, aba aberta antes de ser rebaixada); jogá-la para
 *   outra tela sem dizer nada pareceria defeito.
 */
export async function authorize(permission: Permission): Promise<Authorization> {
  const user = await requireStaff();

  if (!can(user.role, permission)) {
    return {
      ok: false,
      message: 'Isso é da gestão. Peça para quem administra a academia.',
    };
  }

  return { ok: true, user };
}

/** `true` se o e-mail recebe gestão pela variável de ambiente. */
export function isGestaoEmail(email: string): boolean {
  return gestaoEmails().includes(email.toLowerCase());
}
