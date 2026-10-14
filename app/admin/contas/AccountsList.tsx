'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { cn, initials } from '@/lib/utils';
import { STATUS_LABELS, type UserStatus } from '@/types/domain';
import { formatBr } from '@/utils/datetime';

import { setAccountRoleAction } from '../actions';

export interface AccountRow {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: 'ADMIN' | 'ALUNO';
  readonly roleFromEnv: boolean;
  readonly enrollmentStatus: UserStatus | null;
  readonly createdAt: string;
  readonly lastSignInAt: string | null;
  readonly isSelf: boolean;
}

type Filter = 'todos' | 'professores' | 'sem_ficha' | 'alunos';

const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: 'todos', label: 'Todas' },
  { id: 'professores', label: 'Professores' },
  { id: 'alunos', label: 'Alunos' },
  { id: 'sem_ficha', label: 'Não preencheram a ficha' },
];

const STATUS_STYLE: Readonly<Record<UserStatus, string>> = {
  ativo: 'bg-emerald-500/15 text-emerald-300',
  pendente: 'bg-amber-500/15 text-amber-300',
  recusado: 'bg-crimson/15 text-crimson',
  inativo: 'bg-white/10 text-muted',
};

export function AccountsList({ rows }: { readonly rows: readonly AccountRow[] }) {
  const [filter, setFilter] = useState<Filter>('todos');
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (term.length > 0) {
        const hit =
          row.name.toLowerCase().includes(term) || row.email.toLowerCase().includes(term);
        if (!hit) return false;
      }
      if (filter === 'professores') return row.role === 'ADMIN';
      if (filter === 'alunos') return row.role === 'ALUNO';
      if (filter === 'sem_ficha') return row.enrollmentStatus === null;
      return true;
    });
  }, [rows, filter, search]);

  const admins = rows.filter((row) => row.role === 'ADMIN').length;
  const orphans = rows.filter((row) => row.enrollmentStatus === null).length;

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface-card p-4">
          <p className="text-xs text-muted">Contas criadas</p>
          <p className="mt-1 font-display text-3xl leading-none tabular-nums">{rows.length}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs text-muted">Professores</p>
          <p className="mt-1 font-display text-3xl leading-none tabular-nums text-crimson">
            {admins}
          </p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs text-muted">Sem ficha preenchida</p>
          <p className="mt-1 font-display text-3xl leading-none tabular-nums">{orphans}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div role="group" aria-label="Filtrar contas" className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              aria-pressed={filter === item.id}
              className={cn(
                'inline-flex min-h-[44px] items-center rounded-xl border px-4 text-sm font-medium transition-colors',
                filter === item.id
                  ? 'border-crimson bg-crimson text-foreground'
                  : 'border-hairline bg-white/[.04] text-muted hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <label>
          <span className="sr-only">Buscar conta</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome ou e-mail…"
            className="min-h-[44px] w-full rounded-xl border border-hairline bg-white/[.04] px-4 text-sm text-foreground placeholder:text-muted/70 focus:border-crimson focus:outline-none sm:w-72"
          />
        </label>
      </div>

      <p aria-live="polite" className="mt-4 text-sm text-muted">
        {visible.length} {visible.length === 1 ? 'conta' : 'contas'}
      </p>

      {visible.length === 0 ? (
        <div className="surface-card mt-4 px-6 py-14 text-center">
          <p className="font-display text-lg uppercase tracking-tight">Nenhuma conta</p>
          <p className="mt-2 text-sm text-muted">Ajuste o filtro ou a busca.</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {visible.map((row) => (
            <li
              key={row.id}
              className={cn(
                'rounded-2xl border p-4 backdrop-blur-md sm:p-5',
                row.role === 'ADMIN'
                  ? 'border-crimson/30 bg-crimson/[.05]'
                  : 'border-hairline bg-white/[.04]',
              )}
            >
              <div className="flex flex-wrap items-start gap-4">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-hairline bg-white/[.06] font-display text-sm text-muted"
                >
                  {initials(row.name)}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {row.name}
                    </span>
                    {row.isSelf ? (
                      <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">
                        você
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted">{row.email}</p>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                        row.role === 'ADMIN'
                          ? 'bg-crimson/20 text-crimson'
                          : 'bg-white/10 text-muted',
                      )}
                    >
                      {row.role === 'ADMIN' ? 'Professor' : 'Aluno'}
                    </span>

                    {row.enrollmentStatus ? (
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                          STATUS_STYLE[row.enrollmentStatus],
                        )}
                      >
                        {STATUS_LABELS[row.enrollmentStatus]}
                      </span>
                    ) : (
                      <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-muted">
                        Ficha não preenchida
                      </span>
                    )}

                    {row.roleFromEnv ? (
                      <span className="rounded-full border border-dashed border-crimson/40 px-2.5 py-1 text-[11px] text-muted">
                        via ADMIN_EMAILS
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="text-right text-xs text-muted">
                  <p>criada em {formatBr(row.createdAt.slice(0, 10))}</p>
                  <p className="mt-0.5">
                    {row.lastSignInAt
                      ? `último acesso ${formatBr(row.lastSignInAt.slice(0, 10))}`
                      : 'nunca entrou'}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
                {row.role === 'ALUNO' ? (
                  <ActionForm
                    action={setAccountRoleAction}
                    confirm={`Dar acesso de professor para ${row.name}? Ele poderá aprovar matrículas, lançar presença e registrar graduação.`}
                  >
                    <input type="hidden" name="userId" value={row.id} />
                    <input type="hidden" name="role" value="ADMIN" />
                    <SubmitButton className="btn-secondary text-xs" pendingLabel="Promovendo…">
                      Tornar professor
                    </SubmitButton>
                  </ActionForm>
                ) : (
                  <ActionForm
                    action={setAccountRoleAction}
                    confirm={`Remover o acesso de professor de ${row.name}?`}
                  >
                    <input type="hidden" name="userId" value={row.id} />
                    <input type="hidden" name="role" value="ALUNO" />
                    <SubmitButton
                      className={cn(
                        'btn-ghost text-xs',
                        (row.isSelf || row.roleFromEnv) && 'pointer-events-none opacity-40',
                      )}
                      pendingLabel="…"
                    >
                      Remover acesso de professor
                    </SubmitButton>
                  </ActionForm>
                )}

                {row.enrollmentStatus ? (
                  <Link href={`/admin/alunos/${row.id}`} className="btn-ghost text-xs">
                    Abrir ficha
                  </Link>
                ) : null}
              </div>

              {row.isSelf && row.role === 'ADMIN' ? (
                <p className="mt-2 text-[11px] text-muted">
                  Você não pode remover o próprio acesso — é a trava que impede a academia de
                  ficar sem nenhum professor.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
