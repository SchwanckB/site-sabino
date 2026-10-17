import type { Metadata } from 'next';

import { requireAdmin } from '@/lib/auth';
import { listAccounts } from '@/lib/repositories/accounts';

import { AccountsList, type AccountRow } from './AccountsList';

export const metadata: Metadata = { title: 'Contas e acessos' };
export const dynamic = 'force-dynamic';

export default async function ContasPage() {
  const admin = await requireAdmin();
  const accounts = await listAccounts();

  const rows: AccountRow[] = accounts
    .map((account) => ({
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      roleFromEnv: account.roleFromEnv,
      rolePersisted: account.rolePersisted,
      enrollmentStatus: account.enrollmentStatus,
      createdAt: account.createdAt,
      lastSignInAt: account.lastSignInAt,
      isSelf: account.id === admin.id,
    }))
    // Professores primeiro, depois quem travou no cadastro, depois o resto.
    .sort((a, b) => {
      const weight = (row: AccountRow): number =>
        row.role === 'ADMIN' ? 0 : row.enrollmentStatus === null ? 1 : 2;
      const diff = weight(a) - weight(b);
      return diff !== 0 ? diff : a.name.localeCompare(b.name, 'pt-BR');
    });

  return (
    <div>
      <header>
        <p className="eyebrow">Permissões</p>
        <h1 className="mt-2 text-3xl leading-none sm:text-4xl">Contas e acessos</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Toda conta criada no site aparece aqui — inclusive quem se cadastrou e parou antes de
          preencher a ficha. <strong className="text-foreground">Professor e administrador são
          o mesmo acesso</strong>: quem ensina precisa aprovar matrícula, lançar presença e
          registrar graduação.
        </p>
      </header>

      {accounts.length === 0 ? (
        <div className="surface-card mt-8 px-6 py-16 text-center">
          <p className="font-display text-lg uppercase tracking-tight">Nenhuma conta ainda</p>
          <p className="mt-2 text-sm text-muted">
            As contas aparecem aqui assim que alguém se cadastrar pelo site.
          </p>
        </div>
      ) : (
        <div className="mt-8">
          <AccountsList rows={rows} />
        </div>
      )}
    </div>
  );
}
