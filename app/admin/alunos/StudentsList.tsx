'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import {
  STATUS_LABELS,
  UNIT_SHORT,
  USER_STATUSES,
  type UnitId,
  type UnitScope,
  type UserStatus,  beltLabel,
} from '@/types/domain';

export interface StudentRow {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly age: number;
  readonly belt: string;
  readonly degree: number;
  readonly category: 'kids' | 'adulto';
  readonly status: UserStatus;
  readonly classCount: number;
  readonly joinedAt: string | null;
  readonly unit: UnitId;
}

/** Situação do cadastro no semáforo do painel — ver `globals.css`. */
const STATUS_STYLE: Readonly<Record<UserStatus, string>> = {
  ativo: 'badge-ok',
  pendente: 'badge-warn',
  recusado: 'badge-late',
  inativo: 'badge-neutral',
};

export function StudentsList({
  rows,
  scope,
}: {
  readonly rows: readonly StudentRow[];
  readonly scope: UnitScope;
}) {
  // Com uma academia escolhida o crachá seria a mesma palavra em toda linha.
  const mostrarUnidade = scope === 'todas';
  const [status, setStatus] = useState<UserStatus | 'todos'>('ativo');
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (status !== 'todos' && row.status !== status) return false;
      if (term.length === 0) return true;
      return (
        row.name.toLowerCase().includes(term) || row.email.toLowerCase().includes(term)
      );
    });
  }, [rows, status, search]);

  return (
    <div>
      {/*
        Filtro e busca acompanham a rolagem.

        A lista passa de cem alunos. Quem rolava até o meio e queria trocar o
        filtro tinha de voltar ao topo — e voltar ao topo numa lista longa é o
        tipo de atrito que faz a pessoa desistir e procurar com Ctrl+F. O
        deslocamento acompanha a altura do cabeçalho fixo da casca, que tem
        uma linha a mais no desktop.
      */}
      <div className="sticky top-[6.3rem] z-20 -mx-4 bg-ink/95 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-[6.9rem]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div role="group" aria-label="Filtrar por situação" className="flex flex-wrap gap-2">
            {(['ativo', ...USER_STATUSES.filter((s) => s !== 'ativo'), 'todos'] as const).map(
              (item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setStatus(item)}
                  aria-pressed={status === item}
                  className={cn(
                    'inline-flex min-h-[44px] items-center rounded-xl border px-4 text-sm font-medium capitalize transition-colors',
                    status === item
                      ? 'border-crimson bg-crimson text-foreground'
                      : 'border-hairline bg-white/[.04] text-muted hover:text-foreground',
                  )}
                >
                  {item === 'todos' ? 'Todos' : STATUS_LABELS[item]}
                </button>
              ),
            )}
          </div>

          <label>
            <span className="sr-only">Buscar aluno</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome ou e-mail…"
              className="min-h-[44px] w-full rounded-xl border border-hairline bg-white/[.04] px-4 text-sm text-foreground placeholder:text-muted/70 focus:border-crimson focus:outline-none sm:w-72"
            />
          </label>
        </div>

        <p aria-live="polite" className="mt-2 text-xs text-muted">
          {visible.length} {visible.length === 1 ? 'aluno' : 'alunos'}
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="panel mt-3 px-6 py-14 text-center">
          <p className="font-display text-lg uppercase tracking-tight">Nenhum aluno</p>
          <p className="mt-2 text-sm text-muted">Ajuste o filtro ou a busca.</p>
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {visible.map((row) => (
            <li key={row.id}>
              <Link
                href={`/admin/alunos/${row.id}`}
                className="panel flex flex-wrap items-center gap-4 p-4 transition-colors hover:border-white/20"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
                  <p className="truncate text-xs text-muted">
                    {row.age} anos · {beltLabel(row.belt)}
                    {row.degree > 0 ? ` ${row.degree}º` : ''} ·{' '}
                    {row.classCount} {row.classCount === 1 ? 'turma' : 'turmas'}
                    {mostrarUnidade ? ` · ${UNIT_SHORT[row.unit]}` : ''}
                  </p>
                </div>

                <span className={cn('shrink-0', STATUS_STYLE[row.status])}>
                  {STATUS_LABELS[row.status]}
                </span>

                <span aria-hidden="true" className="text-muted">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
