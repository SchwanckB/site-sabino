'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { ROLE_HINTS, ROLE_LABELS, type Role } from '@/lib/roles';
import { cn, initials } from '@/lib/utils';
import { STATUS_LABELS, type UserStatus } from '@/types/domain';
import { formatBr } from '@/utils/datetime';

import { deleteAccountAction, setAccountRoleAction } from '../actions';

export interface AccountRow {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
  readonly roleFromEnv: boolean;
  readonly rolePersisted: boolean;
  readonly enrollmentStatus: UserStatus | null;
  readonly createdAt: string;
  readonly lastSignInAt: string | null;
  readonly isSelf: boolean;
}

type Filter = 'todos' | 'gestao' | 'professores' | 'sem_ficha' | 'alunos';

const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: 'todos', label: 'Todas' },
  { id: 'gestao', label: 'Gestão' },
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

/**
 * Cor do papel.
 *
 * Gestão em vermelho cheio, professor em vermelho fraco, aluno em cinza: a
 * escada de cor é a escada de permissão, e dá para varrer a lista sem ler
 * rótulo nenhum.
 */
const ROLE_STYLE: Readonly<Record<Role, string>> = {
  GESTAO: 'border-crimson/50 bg-crimson/25 text-foreground',
  PROFESSOR: 'border-crimson/30 bg-crimson/[.12] text-crimson',
  ALUNO: 'border-white/[.12] bg-white/[.07] text-muted',
};

const ROW_STYLE: Readonly<Record<Role, string | null>> = {
  GESTAO: 'border-crimson/40 bg-crimson/[.07]',
  PROFESSOR: 'border-crimson/20 bg-crimson/[.03]',
  ALUNO: null,
};

/**
 * O que a troca de papel significa, em uma frase, antes de confirmar.
 *
 * O texto depende de **onde a conta está** e não só de para onde vai: "dar
 * acesso de professor" e "tirar a gestão, deixando só professor" terminam no
 * mesmo papel e são decisões opostas. Um `confirm()` genérico fazia a segunda
 * parecer a primeira.
 */
function confirmText(row: AccountRow, to: Role): string {
  if (to === 'GESTAO') {
    return `Dar a gestão completa para ${row.name}? Ele passa a ver e mexer em dinheiro, caixa, planos, grade de horários e no acesso das outras contas — inclusive promover e rebaixar gente.`;
  }

  if (to === 'PROFESSOR') {
    return row.role === 'GESTAO'
      ? `Tirar a gestão de ${row.name} e deixar só como professor? Ele continua abrindo aula, lançando presença e graduando, mas perde dinheiro, caixa, planos, horários e contas.`
      : `Dar acesso de professor para ${row.name}? Ele passa a abrir aula, lançar presença, mostrar o QR e registrar graduação. Não vê dinheiro.`;
  }

  return `Tirar o acesso ao painel da academia de ${row.name}? Ele volta a ser só aluno.`;
}

const LABEL_ACAO: Readonly<Record<Role, string>> = {
  GESTAO: 'Promover à gestão',
  PROFESSOR: 'Tornar professor',
  ALUNO: 'Tirar acesso ao painel',
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
      if (filter === 'gestao') return row.role === 'GESTAO';
      if (filter === 'professores') return row.role === 'PROFESSOR';
      if (filter === 'alunos') return row.role === 'ALUNO';
      if (filter === 'sem_ficha') return row.enrollmentStatus === null;
      return true;
    });
  }, [rows, filter, search]);

  const gestores = rows.filter((row) => row.role === 'GESTAO').length;
  const professores = rows.filter((row) => row.role === 'PROFESSOR').length;
  const orphans = rows.filter((row) => row.enrollmentStatus === null).length;

  return (
    <div>
      {/*
        Legenda dos dois níveis.

        A tela promove e rebaixa gente, e quem chega aqui depois de um mês sem
        abrir não lembra o que "professor" deixa de ver. Explicar aqui em cima
        é mais barato que explicar dentro de cada botão.
      */}
      <section className="panel panel-pad">
        <h2 className="panel-title">Os dois acessos do painel</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {(['GESTAO', 'PROFESSOR'] as const).map((role) => (
            <div key={role} className="rounded-xl border border-hairline bg-white/[.03] p-3.5">
              <dt>
                <span className={cn('badge', ROLE_STYLE[role])}>{ROLE_LABELS[role]}</span>
              </dt>
              <dd className="mt-2 text-xs leading-relaxed text-muted">{ROLE_HINTS[role]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Os dois entram pelo mesmo lugar. O que muda é o menu que aparece e o que o painel
          aceita salvar.
        </p>
      </section>

      <div className="mt-3 grid gap-4 sm:grid-cols-4">
        <div className="panel p-4">
          <p className="text-xs text-muted">Contas criadas</p>
          <p className="mt-1 font-display text-3xl leading-none tabular-nums">{rows.length}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs text-muted">Gestão</p>
          <p className="mt-1 font-display text-3xl leading-none tabular-nums text-crimson">
            {gestores}
          </p>
        </div>
        <div className="panel p-4">
          <p className="text-xs text-muted">Professores</p>
          <p className="mt-1 font-display text-3xl leading-none tabular-nums">{professores}</p>
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
            <li key={row.id} className={cn('panel p-4 sm:p-5', ROW_STYLE[row.role])}>
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
                    <span className={cn('badge', ROLE_STYLE[row.role])}>
                      {ROLE_LABELS[row.role]}
                    </span>

                    {row.enrollmentStatus ? (
                      <span className={STATUS_STYLE[row.enrollmentStatus]}>
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
                {/*
                  Um botão por papel que a conta ainda não tem. Antes era um
                  par de botões fixo ("tornar professor" / "remover acesso"),
                  que com três níveis não diria para onde a conta vai.
                */}
                {(['GESTAO', 'PROFESSOR', 'ALUNO'] as const)
                  .filter((role) => role !== row.role)
                  .map((role) => {
                    // Gestão vinda de ADMIN_EMAILS volta no próximo login: o
                    // botão existiria só para dar uma mensagem de erro.
                    const travado = row.roleFromEnv && role !== 'GESTAO';
                    // Ninguém tira a própria gestão — ver `setAccountRoleAction`.
                    const seTrancando = row.isSelf && row.role === 'GESTAO';

                    return (
                      <ActionForm
                        key={role}
                        action={setAccountRoleAction}
                        confirm={confirmText(row, role)}
                      >
                        <input type="hidden" name="userId" value={row.id} />
                        <input type="hidden" name="role" value={role} />
                        <SubmitButton
                          className={cn(
                            role === 'ALUNO' ? 'btn-ghost text-xs' : 'btn-secondary text-xs',
                            (travado || seTrancando) && 'pointer-events-none opacity-40',
                          )}
                          pendingLabel="Salvando…"
                        >
                          {LABEL_ACAO[role]}
                        </SubmitButton>
                      </ActionForm>
                    );
                  })}

                {/*
                  Papel vindo só de ADMIN_EMAILS some junto com a variável: um
                  deploy sem ela e a academia fica sem gestão. Gravar na conta
                  tira essa dependência — e sem este botão não havia como
                  fazê-lo, já que a tela já a mostrava como gestão.
                */}
                {row.roleFromEnv && !row.rolePersisted ? (
                  <ActionForm
                    action={setAccountRoleAction}
                    confirm={`Gravar a gestão na conta de ${row.name}? Assim ela não depende mais da variável ADMIN_EMAILS.`}
                  >
                    <input type="hidden" name="userId" value={row.id} />
                    <input type="hidden" name="role" value="GESTAO" />
                    <SubmitButton className="btn-secondary text-xs" pendingLabel="Gravando…">
                      Fixar gestão na conta
                    </SubmitButton>
                  </ActionForm>
                ) : null}

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

              {row.isSelf && row.role === 'GESTAO' ? (
                <p className="mt-2 text-[11px] text-muted">
                  Você não pode tirar a sua própria gestão — é a trava que impede a academia de
                  ficar sem ninguém capaz de devolver acesso. Promova outra pessoa primeiro.
                </p>
              ) : null}

              {row.roleFromEnv ? (
                <p className="mt-2 text-[11px] text-muted">
                  Esta conta tem gestão por estar em <code>ADMIN_EMAILS</code>. Para rebaixá-la,
                  tire o e-mail da variável de ambiente na Vercel primeiro.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
