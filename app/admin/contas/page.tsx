import type { Metadata } from 'next';

import { PageHeader } from '@/components/app/PageHeader';

import { requirePermission } from '@/lib/auth';
import { listAccounts } from '@/lib/repositories/accounts';
import type { Role } from '@/lib/roles';

import { AccountsList, type AccountRow } from './AccountsList';

export const metadata: Metadata = { title: 'Contas e acessos' };
export const dynamic = 'force-dynamic';

/** Ordem de leitura: quem administra, quem ensina, quem travou, o resto. */
const ROLE_WEIGHT: Readonly<Record<Role, number>> = {
  GESTAO: 0,
  PROFESSOR: 1,
  ALUNO: 3,
};

export default async function ContasPage() {
  const admin = await requirePermission('contas');
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
    .sort((a, b) => {
      const weight = (row: AccountRow): number =>
        row.role === 'ALUNO' && row.enrollmentStatus === null ? 2 : ROLE_WEIGHT[row.role];
      const diff = weight(a) - weight(b);
      return diff !== 0 ? diff : a.name.localeCompare(b.name, 'pt-BR');
    });

  return (
    <div className="page-stack">
      <PageHeader
        title="Contas e acessos"
        meta="Quem entra no painel da academia, e com qual permissão."
      />

      {accounts.length === 0 ? (
        <div className="panel px-6 py-16 text-center">
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
