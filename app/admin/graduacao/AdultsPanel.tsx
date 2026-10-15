'use client';

import { useCallback, useMemo, useState } from 'react';

import { cn, formatBrDate, pluralize } from '@/lib/utils';
import { BELT_ORDER, type AdultBelt, type AdultSummary } from '@/utils/graduationEngine';

/**
 * Tabela de adultos: sem automação, só os dados que o professor usa para
 * decidir a graduação. No celular vira lista de cards.
 */

const BELT_SWATCH: Readonly<Record<AdultBelt, string>> = {
  branca: 'bg-belt-branca',
  azul: 'bg-belt-azul',
  roxa: 'bg-belt-roxa',
  marrom: 'bg-belt-marrom',
  preta: 'bg-belt-preta',
};

function EmptyState({ title, description }: { readonly title: string; readonly description: string }) {
  return (
    <div className="surface-card flex flex-col items-center px-6 py-16 text-center">
      <p className="font-display text-lg uppercase tracking-tight">{title}</p>
      <p className="mt-2 max-w-sm text-sm text-muted">{description}</p>
    </div>
  );
}

type SortKey = 'name' | 'belt' | 'lastGraduationAt' | 'daysOnCurrentBelt' | 'totalCheckins' | 'checkinsLast90Days';
type SortDirection = 'asc' | 'desc';

const COLUMNS: readonly { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'name', label: 'Aluno', numeric: false },
  { key: 'belt', label: 'Faixa', numeric: false },
  { key: 'lastGraduationAt', label: 'Última graduação', numeric: false },
  { key: 'daysOnCurrentBelt', label: 'Tempo na faixa', numeric: true },
  { key: 'totalCheckins', label: 'Check-ins', numeric: true },
  { key: 'checkinsLast90Days', label: 'Últimos 90 dias', numeric: true },
];

function compareSummaries(a: AdultSummary, b: AdultSummary, key: SortKey): number {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name, 'pt-BR');
    case 'belt':
      return BELT_ORDER.indexOf(a.belt) - BELT_ORDER.indexOf(b.belt) || a.degree - b.degree;
    case 'lastGraduationAt':
      return (a.lastGraduationAt ?? '').localeCompare(b.lastGraduationAt ?? '');
    case 'daysOnCurrentBelt':
      return a.daysOnCurrentBelt - b.daysOnCurrentBelt;
    case 'totalCheckins':
      return a.totalCheckins - b.totalCheckins;
    case 'checkinsLast90Days':
      return a.checkinsLast90Days - b.checkinsLast90Days;
  }
}

function BeltCell({ belt, degree }: { readonly belt: AdultBelt; readonly degree: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={cn(
          'flex h-4 w-9 shrink-0 items-center justify-end gap-[2px] rounded-[3px] px-1 ring-1 ring-inset ring-white/15',
          BELT_SWATCH[belt],
        )}
      >
        {Array.from({ length: degree }, (_, index) => (
          <span key={index} className="h-2.5 w-[2px] rounded-[1px] bg-white/80" />
        ))}
      </span>
      <span className="capitalize">
        {belt}
        {degree > 0 ? ` ${degree}º` : ''}
      </span>
    </span>
  );
}

function TimeOnBelt({ summary }: { readonly summary: AdultSummary }) {
  const years = Math.floor(summary.monthsOnCurrentBelt / 12);
  const months = summary.monthsOnCurrentBelt % 12;

  const label =
    years > 0
      ? `${years} ${pluralize(years, 'ano', 'anos')}${months > 0 ? ` e ${months} ${pluralize(months, 'mês', 'meses')}` : ''}`
      : `${months} ${pluralize(months, 'mês', 'meses')}`;

  return (
    <span className="whitespace-nowrap">
      {label}
      <span className="block text-xs text-muted tabular-nums">
        {summary.daysOnCurrentBelt} {pluralize(summary.daysOnCurrentBelt, 'dia', 'dias')}
      </span>
    </span>
  );
}

export function AdultsPanel({
  adults,
}: {
  readonly adults: readonly AdultSummary[];
}) {
  const [beltFilter, setBeltFilter] = useState<AdultBelt | 'todas'>('todas');
  const [sortKey, setSortKey] = useState<SortKey>('daysOnCurrentBelt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const rows = useMemo(() => {
    const filtered =
      beltFilter === 'todas' ? [...adults] : adults.filter((item) => item.belt === beltFilter);

    return filtered.sort((a, b) => {
      const result = compareSummaries(a, b, sortKey);
      return sortDirection === 'asc' ? result : -result;
    });
  }, [adults, beltFilter, sortKey, sortDirection]);

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDirection(key === 'name' || key === 'belt' ? 'asc' : 'desc');
      }
    },
    [sortKey],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por faixa">
        {(['todas', ...BELT_ORDER] as const).map((belt) => {
          const active = beltFilter === belt;
          return (
            <button
              key={belt}
              type="button"
              onClick={() => setBeltFilter(belt)}
              aria-pressed={active}
              className={cn(
                'inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-3.5 text-sm font-medium capitalize transition-all duration-300',
                active
                  ? 'border-crimson bg-crimson text-foreground'
                  : 'border-hairline bg-white/[.04] text-muted hover:border-white/20 hover:text-foreground',
              )}
            >
              {belt !== 'todas' ? (
                <span
                  aria-hidden="true"
                  className={cn('h-3 w-5 rounded-[2px] ring-1 ring-inset ring-white/20', BELT_SWATCH[belt])}
                />
              ) : null}
              {belt}
            </button>
          );
        })}
      </div>

      <p aria-live="polite" className="mt-4 text-sm text-muted">
        {rows.length} {pluralize(rows.length, 'aluno', 'alunos')}
        {beltFilter !== 'todas' ? ` na faixa ${beltFilter}` : ' no total'}
      </p>

      {rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Nenhum aluno nesta faixa"
            description="Troque o filtro acima para ver os demais alunos adultos."
          />
        </div>
      ) : (
        <>
          {/* Desktop: tabela ordenavel. */}
          <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-hairline md:block">
            <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
              <caption className="sr-only">
                Alunos adultos, faixa, tempo na faixa e frequência. Use os cabeçalhos para ordenar.
              </caption>
              <thead>
                <tr className="bg-white/[.03]">
                  {COLUMNS.map((column) => {
                    const active = sortKey === column.key;
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        aria-sort={
                          active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'
                        }
                        className={cn(
                          'border-b border-hairline p-0',
                          column.numeric && 'text-right',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(column.key)}
                          className={cn(
                            'flex min-h-[44px] w-full items-center gap-1.5 px-4 text-xs uppercase tracking-[0.12em] transition-colors hover:text-foreground',
                            column.numeric && 'justify-end',
                            active ? 'text-foreground' : 'text-muted',
                          )}
                        >
                          {column.label}
                          <span aria-hidden="true" className={cn('text-[10px]', !active && 'opacity-0')}>
                            {sortDirection === 'asc' ? '▲' : '▼'}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((summary) => (
                  <tr key={summary.studentId} className="border-b border-hairline last:border-b-0 hover:bg-white/[.03]">
                    <th scope="row" className="px-4 py-3 font-normal">
                      <span className="block text-foreground">{summary.name}</span>
                      <span className="block text-xs text-muted">{summary.age} anos</span>
                    </th>
                    <td className="px-4 py-3 text-foreground">
                      <BeltCell belt={summary.belt} degree={summary.degree} />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-foreground">
                      {formatBrDate(summary.lastGraduationAt)}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground">
                      <TimeOnBelt summary={summary} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {summary.totalCheckins}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span
                        className={cn(
                          summary.checkinsLast90Days === 0 ? 'text-crimson' : 'text-foreground',
                        )}
                      >
                        {summary.checkinsLast90Days}
                      </span>
                      <span className="block text-xs text-muted">
                        últ. {formatBrDate(summary.lastCheckinAt)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: a mesma tabela vira lista de cards. */}
          <ul className="mt-4 space-y-3 md:hidden">
            {rows.map((summary) => (
              <li key={summary.studentId} className="surface-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{summary.name}</p>
                    <p className="text-xs text-muted">{summary.age} anos</p>
                  </div>
                  <span className="shrink-0 text-xs text-foreground">
                    <BeltCell belt={summary.belt} degree={summary.degree} />
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-hairline pt-4 text-xs">
                  <div>
                    <dt className="text-muted">Última graduação</dt>
                    <dd className="mt-0.5 tabular-nums text-foreground">
                      {formatBrDate(summary.lastGraduationAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Tempo na faixa</dt>
                    <dd className="mt-0.5 text-foreground">
                      <TimeOnBelt summary={summary} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Check-ins</dt>
                    <dd className="mt-0.5 tabular-nums text-foreground">{summary.totalCheckins}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Últimos 90 dias</dt>
                    <dd
                      className={cn(
                        'mt-0.5 tabular-nums',
                        summary.checkinsLast90Days === 0 ? 'text-crimson' : 'text-foreground',
                      )}
                    >
                      {summary.checkinsLast90Days}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

