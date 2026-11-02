'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { cn, initials } from '@/lib/utils';
import { STATUS_LABELS, type UserStatus } from '@/types/domain';
import { formatBr } from '@/utils/datetime';

import { deleteAccountAction, setAccountRoleAction } from '../actions';

export interface AccountRow {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: 'ADMIN' | 'ALUNO';
  readonly roleFromEnv: boolean;
  readonly rolePersisted: boolean;
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

/** Situação do cadastro no semáforo do painel — ver `globals.css`. */
const STATUS_STYLE: Readonly<Record<UserStatus, string>> = {
  ativo: 'badge-ok',
  pendente: 'badge-warn',
  recusado: 'badge-late',
  inativo: 'badge-neutral',
};

export function AccountsList({ rows }: { readonly rows: readonly AccountRow[] }) {
  const [filter, setFilter] = useState<Filter>('todos');
  const [deleting, setDeleting] = useState<string | null>(null);
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
        <div className="panel p-4">
          <p className="text-xs text-muted">Contas criadas</p>
          <p className="mt-1 font-display text-3xl leading-none tabular-nums">{rows.length}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs text-muted">Professores</p>
          <p className="mt-1 font-display text-3xl leading-none tabular-nums text-crimson">
            {admins}
          </p>
        </div>
        <div className="panel p-4">
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
        <div className="panel mt-4 px-6 py-14 text-center">
          <p className="font-display text-lg uppercase tracking-tight">Nenhuma conta</p>
          <p className="mt-2 text-sm text-muted">Ajuste o filtro ou a busca.</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {visible.map((row) => (
            <li
              key={row.id}
              className={cn(
                'panel p-4 sm:p-5',
                row.role === 'ADMIN' ? 'border-crimson/30 bg-crimson/[.05]' : null,
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
                        'badge',
                        row.role === 'ADMIN'
                          ? 'border-crimson/40 bg-crimson/20 text-crimson'
                          : 'border-white/[.12] bg-white/[.07] text-muted',
                      )}
                    >
                      {row.role === 'ADMIN' ? 'Professor' : 'Aluno'}
                    </span>

                    {row.enrollmentStatus ? (
                      <span
                        className={STATUS_STYLE[row.enrollmentStatus]}
                      >
                        {STATUS_LABELS[row.enrollmentStatus]}
                      </span>
                    ) : (
                      <span className="badge-neutral">Ficha não preenchida</span>
                    )}

                    {row.roleFromEnv && !row.rolePersisted ? (
                      <span className="badge-warn border-dashed">acesso só via ADMIN_EMAILS</span>
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
                  <>
                    {/*
                      Papel vindo só de ADMIN_EMAILS some junto com a variável:
                      um deploy sem ela e o professor perde o painel. Gravar na
                      conta tira essa dependência — e sem este botão não havia
                      como fazê-lo, já que a tela já o mostrava como professor.
                    */}
                    {row.roleFromEnv && !row.rolePersisted ? (
                      <ActionForm
                        action={setAccountRoleAction}
                        confirm={`Gravar o acesso de professor na conta de ${row.name}? Assim ele não depende mais da variável ADMIN_EMAILS.`}
                      >
                        <input type="hidden" name="userId" value={row.id} />
                        <input type="hidden" name="role" value="ADMIN" />
                        <SubmitButton className="btn-secondary text-xs" pendingLabel="Gravando…">
                          Fixar acesso na conta
                        </SubmitButton>
                      </ActionForm>
                    ) : null}

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
                  </>
                )}

                {row.enrollmentStatus ? (
                  <Link href={`/admin/alunos/${row.id}`} className="btn-ghost text-xs">
                    Abrir ficha
                  </Link>
                ) : null}

                {/*
                  Apagar só existia na página do aluno, que só existe para quem
                  tem ficha. A conta velha mais comum é justamente a de quem
                  criou o login e nunca terminou o cadastro: ela não tinha
                  página nenhuma e ficava na lista para sempre.
                */}
                {!row.isSelf && !row.roleFromEnv ? (
                  <button
                    type="button"
                    onClick={() => setDeleting(deleting === row.id ? null : row.id)}
                    className="btn-ghost text-xs text-crimson"
                  >
                    {deleting === row.id ? 'Cancelar' : 'Apagar conta'}
                  </button>
                ) : null}
              </div>

              {deleting === row.id ? (
                <ActionForm
                  action={deleteAccountAction}
                  className="notice-late mt-3"
                  onDone={(result) => {
                    if (result.ok) setDeleting(null);
                  }}
                >
                  <input type="hidden" name="userId" value={row.id} />

                  <p className="text-sm font-semibold text-crimson">
                    Apagar a conta de {row.name}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {row.enrollmentStatus
                      ? 'Apaga o login e também a ficha: presenças, graduações, mensalidade e documento. Não tem desfazer.'
                      : 'Esta conta não tem ficha de aluno. Apaga só o login, e não tem desfazer.'}
                  </p>

                  <label className="mt-3 block">
                    <span className="block text-xs text-muted">
                      Digite o e-mail da conta para confirmar
                    </span>
                    <input
                      name="confirmEmail"
                      type="text"
                      autoComplete="off"
                      placeholder={row.email || 'conta sem e-mail'}
                      className="mt-1 min-h-[44px] w-full max-w-sm rounded-xl border border-crimson/40 bg-white/[.04] px-3 py-2 text-sm text-foreground focus:border-crimson focus:outline-none"
                    />
                  </label>

                  <div className="mt-3">
                    <SubmitButton className="btn-primary text-xs" pendingLabel="Apagando…">
                      Apagar definitivamente
                    </SubmitButton>
                  </div>
                </ActionForm>
              ) : null}

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
