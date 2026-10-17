'use client';

import { useMemo, useState } from 'react';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { cn } from '@/lib/utils';
import { CHECKIN_SOURCE_LABELS, beltLabel, type CheckinSource } from '@/types/domain';

import { markPresenceAction, markPresenceBatchAction, undoPresenceAction } from '../actions';

export interface PresenceRow {
  readonly id: string;
  readonly name: string;
  readonly belt: string;
  readonly degree: number;
  /** Turmas do aluno que estão na janela de check-in agora. */
  readonly inClassNow: string | null;
  readonly present: boolean;
  readonly presentAt: string | null;
  readonly presentSource: CheckinSource | null;
  /** Turmas em que o aluno está matriculado, para o resumo por turma. */
  readonly classIds: readonly string[];
}

export interface TurmaResumo {
  readonly id: string;
  readonly label: string;
  readonly openNow: boolean;
}

type Filter = 'aula_agora' | 'todos' | 'faltantes';

const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: 'aula_agora', label: 'Com aula agora' },
  { id: 'faltantes', label: 'Ainda sem presença' },
  { id: 'todos', label: 'Todos os ativos' },
];

/**
 * Lista de presença com os dois modos manuais.
 *
 * O padrão é "com aula agora": durante o treino, a recepção vê só quem deveria
 * estar no tatame naquele horário, em vez da academia inteira.
 */
export function PresenceList({
  rows,
  todayLabel,
  turmas,
}: {
  readonly rows: readonly PresenceRow[];
  readonly todayLabel: string;
  readonly turmas: readonly TurmaResumo[];
}) {
  const [filter, setFilter] = useState<Filter>('aula_agora');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (term.length > 0 && !row.name.toLowerCase().includes(term)) return false;
      if (filter === 'aula_agora') return row.inClassNow !== null;
      if (filter === 'faltantes') return !row.present;
      return true;
    });
  }, [rows, filter, search]);

  const selectable = visible.filter((row) => !row.present);
  const allSelected = selectable.length > 0 && selectable.every((row) => selected.has(row.id));

  const toggle = (id: string): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (): void => {
    setSelected((current) => {
      if (allSelected) {
        const next = new Set(current);
        for (const row of selectable) next.delete(row.id);
        return next;
      }
      const next = new Set(current);
      for (const row of selectable) next.add(row.id);
      return next;
    });
  };

  const presentCount = rows.filter((row) => row.present).length;

  // Fechamento por turma: "kids teve 8 de 12". Sem isso o professor conta a
  // lista na mão no fim da aula para saber se valeu a pena abrir o tatame.
  const resumo = useMemo(
    () =>
      turmas
        .map((turma) => {
          const matriculados = rows.filter((row) => row.classIds.includes(turma.id));
          return {
            ...turma,
            total: matriculados.length,
            presentes: matriculados.filter((row) => row.present).length,
          };
        })
        .filter((turma) => turma.total > 0)
        .sort((a, b) => {
          if (a.openNow !== b.openNow) return a.openNow ? -1 : 1;
          return a.label.localeCompare(b.label, 'pt-BR');
        }),
    [turmas, rows],
  );

  return (
    <div>
      <div className="surface-card flex flex-wrap items-center justify-between gap-4 p-4">
        <p aria-live="polite" className="text-sm text-muted">
          <span className="font-display text-2xl leading-none text-crimson tabular-nums">
            {presentCount}
          </span>{' '}
          {presentCount === 1 ? 'presença hoje' : 'presenças hoje'}{' '}
          <span className="text-xs">({todayLabel})</span>
        </p>

        <label className="w-full min-w-0 sm:w-auto">
          <span className="sr-only">Buscar aluno</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome…"
            className="w-full min-h-[44px] rounded-xl border border-hairline bg-white/[.04] px-4 text-sm text-foreground placeholder:text-muted/70 focus:border-crimson focus:outline-none sm:w-64"
          />
        </label>
      </div>

      {/*
        Fechamento da aula, por turma. A pergunta do fim do treino é "quantos
        vieram da kids hoje?", e até aqui ela só se respondia contando a lista
        na mão.
      */}
      {resumo.length > 0 ? (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {resumo.map((turma) => {
            const proporcao = turma.total === 0 ? 0 : turma.presentes / turma.total;
            return (
              <li
                key={turma.id}
                className={cn(
                  'min-w-0 rounded-xl border p-3',
                  turma.openNow
                    ? 'border-crimson/40 bg-crimson/[.07]'
                    : 'border-hairline bg-white/[.03]',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate text-xs text-muted">{turma.label}</p>
                  <p className="shrink-0 text-sm tabular-nums text-foreground">
                    {turma.presentes}
                    <span className="text-muted">/{turma.total}</span>
                  </p>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[.07]">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      proporcao >= 0.6 ? 'bg-emerald-400' : 'bg-crimson',
                    )}
                    style={{ width: `${Math.round(proporcao * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div role="group" aria-label="Filtrar lista" className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((item) => {
          const active = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              aria-pressed={active}
              className={cn(
                'inline-flex min-h-[44px] items-center rounded-xl border px-4 text-sm font-medium transition-colors',
                active
                  ? 'border-crimson bg-crimson text-foreground'
                  : 'border-hairline bg-white/[.04] text-muted hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Modo 2: presença em lote. ------------------------------------- */}
      {selectable.length > 0 ? (
        <ActionForm action={markPresenceBatchAction} className="mt-5">
          <div className="surface-card flex flex-wrap items-center justify-between gap-4 p-4">
            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-5 w-5 accent-crimson"
              />
              <span className="text-foreground">
                Selecionar todos os visíveis ({selectable.length})
              </span>
            </label>

            <div className="flex items-center gap-3">
              <span aria-live="polite" className="text-sm tabular-nums text-muted">
                {selected.size} selecionado{selected.size === 1 ? '' : 's'}
              </span>
              <SubmitButton
                className={cn('btn-primary', selected.size === 0 && 'pointer-events-none opacity-50')}
                pendingLabel="Marcando…"
              >
                Marcar presença em lote
              </SubmitButton>
            </div>
          </div>

          {[...selected].map((id) => (
            <input key={id} type="hidden" name="studentIds" value={id} />
          ))}
        </ActionForm>
      ) : null}

      {visible.length === 0 ? (
        <div className="surface-card mt-5 px-6 py-14 text-center">
          <p className="font-display text-lg uppercase tracking-tight">Nenhum aluno aqui</p>
          <p className="mt-2 text-sm text-muted">
            {filter === 'aula_agora'
              ? 'Nenhuma turma está na janela de check-in neste horário. Troque para "Todos os ativos".'
              : 'Ajuste a busca ou o filtro.'}
          </p>
        </div>
      ) : (
        <ul className="mt-5 space-y-2">
          {visible.map((row) => (
            <li
              key={row.id}
              className={cn(
                'surface-card flex flex-wrap items-center gap-3 p-3 sm:p-4',
                row.present && 'border-emerald-500/30 bg-emerald-500/[.05]',
              )}
            >
              {!row.present ? (
                <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
                  <span className="sr-only">Selecionar {row.name}</span>
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggle(row.id)}
                    className="h-5 w-5 accent-crimson"
                  />
                </label>
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-emerald-400"
                >
                  <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m4 10.5 4 4 8-9" />
                  </svg>
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
                <p className="truncate text-xs text-muted">
                  {beltLabel(row.belt)}
                  {row.degree > 0 ? ` ${row.degree}º` : ''}
                  {row.inClassNow ? ` · ${row.inClassNow}` : ''}
                  {row.present && row.presentSource
                    ? ` · presente às ${row.presentAt} (${CHECKIN_SOURCE_LABELS[row.presentSource]})`
                    : ''}
                </p>
              </div>

              {/* Modo 1: presença individual. --------------------------- */}
              {row.present ? (
                <ActionForm
                  action={undoPresenceAction}
                  className="shrink-0"
                  confirm={`Remover a presença de ${row.name} hoje?`}
                >
                  <input type="hidden" name="studentId" value={row.id} />
                  <SubmitButton className="btn-ghost text-xs" pendingLabel="…">
                    Desfazer
                  </SubmitButton>
                </ActionForm>
              ) : (
                <ActionForm action={markPresenceAction} className="shrink-0">
                  <input type="hidden" name="studentId" value={row.id} />
                  <SubmitButton className="btn-secondary text-xs" pendingLabel="…">
                    Marcar presente
                  </SubmitButton>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
