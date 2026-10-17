import type { Metadata } from 'next';

import { PageHeader } from '@/components/app/PageHeader';

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
      <PageHeader
        title="Contas e acessos"
        meta="Professor e administrador são o mesmo acesso."
      />

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
