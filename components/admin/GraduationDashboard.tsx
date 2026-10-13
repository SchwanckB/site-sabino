'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Image from 'next/image';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { cn, formatBrDate, initials, pluralize } from '@/lib/utils';
import {
  BELT_ORDER,
  KIDS_TOTAL_DEGREES,
  getDegreeColor,
  type AdultBelt,
  type AdultSummary,
  type GraduationResult,
  type KidsStudent,
  type StripeColor,
} from '@/utils/graduationEngine';

/* -------------------------------------------------------------------------- */
/* Props                                                                      */
/* -------------------------------------------------------------------------- */

/** Aluno Kids com o resultado do motor de graduacao ja calculado. */
export interface KidsRow {
  readonly student: KidsStudent;
  readonly result: GraduationResult;
}

export interface GraduationDashboardProps {
  /** Elegiveis deste mes, na ordem em que devem aparecer. */
  readonly kids: readonly KidsRow[];
  readonly adults: readonly AdultSummary[];
  readonly isLoading?: boolean;
  readonly error?: string | null;
  /** Registra o proximo grau. O componente nao faz I/O. */
  readonly onRegisterDegree?: (studentId: string) => void;
  /** Desfaz o ultimo registro, enquanto o aviso estiver na tela. */
  readonly onUndoDegree?: (studentId: string) => void;
  readonly onRetry?: () => void;
}

type TabId = 'kids' | 'adults';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'kids', label: 'Criancas elegiveis para grau este mes' },
  { id: 'adults', label: 'Adultos - historico' },
];

const STRIPE_LABEL: Readonly<Record<StripeColor, string>> = {
  branca: 'branca',
  vermelha: 'vermelha',
  amarela: 'amarela',
};

const STRIPE_SWATCH: Readonly<Record<StripeColor, string>> = {
  branca: 'bg-stripe-branca',
  vermelha: 'bg-stripe-vermelha',
  amarela: 'bg-stripe-amarela',
};

const BELT_SWATCH: Readonly<Record<AdultBelt, string>> = {
  branca: 'bg-belt-branca',
  azul: 'bg-belt-azul',
  roxa: 'bg-belt-roxa',
  marrom: 'bg-belt-marrom',
  preta: 'bg-belt-preta',
};

const UNDO_TIMEOUT_MS = 8000;

/* -------------------------------------------------------------------------- */
/* Pecas visuais                                                              */
/* -------------------------------------------------------------------------- */

/** Barra dos 12 graus: cada marca usa a cor da tarja daquele grau. */
function DegreeBar({
  currentDegree,
  nextDegree,
}: {
  readonly currentDegree: number;
  readonly nextDegree: number | null;
}) {
  const slots = Array.from({ length: KIDS_TOTAL_DEGREES }, (_, index) => index + 1);

  return (
    <div
      className="flex items-center gap-[3px]"
      role="img"
      aria-label={`Grau ${currentDegree} de ${KIDS_TOTAL_DEGREES}`}
    >
      {slots.map((degree) => {
        const color = getDegreeColor(degree);
        const earned = degree <= currentDegree;
        const isNext = degree === nextDegree;

        return (
          <span
            key={degree}
            aria-hidden="true"
            className={cn(
              'h-5 flex-1 rounded-[2px] transition-colors duration-300',
              earned && color ? STRIPE_SWATCH[color] : 'bg-white/[.07]',
              isNext && 'ring-1 ring-inset ring-crimson',
            )}
          />
        );
      })}
    </div>
  );
}

function StripeChip({ color }: { readonly color: StripeColor }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white/[.05] py-1 pl-1.5 pr-2.5 text-xs text-foreground">
      <span
        aria-hidden="true"
        className={cn('h-3 w-3 rounded-full ring-1 ring-inset ring-black/30', STRIPE_SWATCH[color])}
      />
      Tarja {STRIPE_LABEL[color]}
    </span>
  );
}

function Avatar({
  name,
  src,
  size = 48,
}: {
  readonly name: string;
  readonly src?: string | null;
  readonly size?: number;
}) {
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full border border-hairline bg-white/[.06] font-display text-sm text-muted"
    >
      {initials(name)}
    </span>
  );
}

function CardSkeleton() {
  return (
    <div className="surface-card animate-pulse p-5">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-white/[.07]" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-2/3 rounded bg-white/[.07]" />
          <div className="h-3 w-1/3 rounded bg-white/[.05]" />
        </div>
      </div>
      <div className="mt-5 h-5 rounded bg-white/[.05]" />
      <div className="mt-5 h-11 rounded-xl bg-white/[.05]" />
    </div>
  );
}

function EmptyState({ title, description }: { readonly title: string; readonly description: string }) {
  return (
    <div className="surface-card flex flex-col items-center px-6 py-16 text-center">
      <span
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-full border border-hairline bg-white/[.04]"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
        </svg>
      </span>
      <p className="mt-4 font-display text-lg uppercase tracking-tight">{title}</p>
      <p className="mt-2 max-w-sm text-sm text-muted">{description}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { readonly message: string; readonly onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center rounded-2xl border border-crimson/40 bg-crimson/[.07] px-6 py-12 text-center"
    >
      <p className="font-display text-lg uppercase tracking-tight">Nao foi possivel carregar</p>
      <p className="mt-2 max-w-sm text-sm text-muted">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="btn-secondary mt-6">
          Tentar novamente
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal de confirmacao                                                       */
/* -------------------------------------------------------------------------- */

function ConfirmDialog({
  row,
  onConfirm,
  onCancel,
}: {
  readonly row: KidsRow;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const descriptionId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  // Escape fecha; Tab circula dentro do modal.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusables = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const { student, result } = row;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/80 p-4 backdrop-blur-sm sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0.12 : 0.25 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: reduceMotion ? 0.12 : 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md rounded-3xl border border-hairline bg-surface p-6 shadow-soft sm:p-7"
      >
        <h2 id={titleId} className="text-xl leading-tight sm:text-2xl">
          Registrar grau {result.nextDegree}?
        </h2>

        <div id={descriptionId} className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={student.name} src={student.avatarUrl} size={44} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{student.name}</p>
              <p className="text-xs text-muted">
                {result.age} anos &middot; faixa {student.belt}
              </p>
            </div>
          </div>

          <dl className="space-y-2 rounded-2xl border border-hairline bg-white/[.03] p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted">Grau atual</dt>
              <dd className="tabular-nums text-foreground">
                {result.currentDegree} de {KIDS_TOTAL_DEGREES}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted">Proximo grau</dt>
              <dd className="text-foreground">
                {result.nextDegree}
                {result.nextDegreeColor ? ` (tarja ${STRIPE_LABEL[result.nextDegreeColor]})` : ''}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted">Ultima graduacao</dt>
              <dd className="tabular-nums text-foreground">{formatBrDate(result.anchorDate)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted">Tempo de espera</dt>
              <dd className="tabular-nums text-foreground">
                {result.daysSinceLastGraduation}{' '}
                {pluralize(result.daysSinceLastGraduation, 'dia', 'dias')}
              </dd>
            </div>
          </dl>

          <p className="text-xs leading-relaxed text-muted">
            A data de hoje vira a nova ancora do aluno. Voce pode desfazer logo apos confirmar.
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="btn-secondary sm:min-w-[7rem]">
            Cancelar
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="btn-primary sm:min-w-[9rem]"
          >
            Confirmar grau
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Aba Kids                                                                   */
/* -------------------------------------------------------------------------- */

function KidsPanel({
  kids,
  isLoading,
  onRequestRegister,
}: {
  readonly kids: readonly KidsRow[];
  readonly isLoading: boolean;
  readonly onRequestRegister: (row: KidsRow) => void;
}) {
  const reduceMotion = useReducedMotion();

  // Maior tempo de espera primeiro - a ordem de atendimento no tatame.
  const ordered = useMemo(
    () => [...kids].sort((a, b) => b.result.daysSinceLastGraduation - a.result.daysSinceLastGraduation),
    [kids],
  );

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((key) => (
          <CardSkeleton key={key} />
        ))}
      </div>
    );
  }

  if (ordered.length === 0) {
    return (
      <EmptyState
        title="Nenhum aluno elegivel este mes"
        description="Assim que alguma crianca completar o intervalo minimo desde a ultima graduacao, ela aparece aqui."
      />
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {ordered.map(({ student, result }, index) => (
        <motion.li
          key={student.id}
          layout={!reduceMotion}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: reduceMotion ? 0.2 : 0.45,
            delay: reduceMotion ? 0 : Math.min(index * 0.05, 0.3),
            ease: [0.22, 1, 0.36, 1],
          }}
          className="surface-card flex flex-col p-5"
        >
          <div className="flex items-start gap-3">
            <Avatar name={student.name} src={student.avatarUrl} />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base normal-case tracking-normal">{student.name}</h3>
              <p className="mt-0.5 text-xs text-muted">
                {result.age} {pluralize(result.age, 'ano', 'anos')} &middot; faixa {student.belt}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-crimson/15 px-2.5 py-1 text-[11px] font-semibold text-crimson">
              Elegivel
            </span>
          </div>

          <div className="mt-5">
            <div className="flex items-baseline justify-between text-xs text-muted">
              <span>
                Grau {result.currentDegree}/{KIDS_TOTAL_DEGREES}
              </span>
              {result.nextDegree !== null ? <span>Proximo: {result.nextDegree}</span> : null}
            </div>
            <div className="mt-2">
              <DegreeBar currentDegree={result.currentDegree} nextDegree={result.nextDegree} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {result.nextDegreeColor ? <StripeChip color={result.nextDegreeColor} /> : null}
            <span className="rounded-full border border-hairline bg-white/[.05] px-2.5 py-1 text-xs tabular-nums text-muted">
              {result.daysSinceLastGraduation}{' '}
              {pluralize(result.daysSinceLastGraduation, 'dia de espera', 'dias de espera')}
            </span>
          </div>

          <dl className="mt-4 flex items-center justify-between border-t border-hairline pt-4 text-xs">
            <dt className="text-muted">
              {result.anchorSource === 'lastGraduationAt' ? 'Ultima graduacao' : 'Entrada na academia'}
            </dt>
            <dd className="tabular-nums text-foreground">{formatBrDate(result.anchorDate)}</dd>
          </dl>

          <button
            type="button"
            onClick={() => onRequestRegister({ student, result })}
            className="btn-primary mt-5 w-full"
          >
            Registrar grau {result.nextDegree}
          </button>
        </motion.li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Aba Adultos                                                                */
/* -------------------------------------------------------------------------- */

type SortKey = 'name' | 'belt' | 'lastGraduationAt' | 'daysOnCurrentBelt' | 'totalCheckins' | 'checkinsLast90Days';
type SortDirection = 'asc' | 'desc';

const COLUMNS: readonly { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'name', label: 'Aluno', numeric: false },
  { key: 'belt', label: 'Faixa', numeric: false },
  { key: 'lastGraduationAt', label: 'Ultima graduacao', numeric: false },
  { key: 'daysOnCurrentBelt', label: 'Tempo na faixa', numeric: true },
  { key: 'totalCheckins', label: 'Check-ins', numeric: true },
  { key: 'checkinsLast90Days', label: 'Ultimos 90 dias', numeric: true },
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
      ? `${years} ${pluralize(years, 'ano', 'anos')}${months > 0 ? ` e ${months} ${pluralize(months, 'mes', 'meses')}` : ''}`
      : `${months} ${pluralize(months, 'mes', 'meses')}`;

  return (
    <span className="whitespace-nowrap">
      {label}
      <span className="block text-xs text-muted tabular-nums">
        {summary.daysOnCurrentBelt} {pluralize(summary.daysOnCurrentBelt, 'dia', 'dias')}
      </span>
    </span>
  );
}

function AdultsPanel({
  adults,
  isLoading,
}: {
  readonly adults: readonly AdultSummary[];
  readonly isLoading: boolean;
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

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((key) => (
          <div key={key} className="surface-card h-16 animate-pulse" />
        ))}
      </div>
    );
  }

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
                Alunos adultos, faixa, tempo na faixa e frequencia. Use os cabecalhos para ordenar.
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
                        ult. {formatBrDate(summary.lastCheckinAt)}
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
                    <dt className="text-muted">Ultima graduacao</dt>
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
                    <dt className="text-muted">Ultimos 90 dias</dt>
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

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

export function GraduationDashboard({
  kids,
  adults,
  isLoading = false,
  error = null,
  onRegisterDegree,
  onUndoDegree,
  onRetry,
}: GraduationDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('kids');
  const [pendingRow, setPendingRow] = useState<KidsRow | null>(null);
  const [undoRow, setUndoRow] = useState<KidsRow | null>(null);

  const reduceMotion = useReducedMotion();
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const triggerRef = useRef<HTMLElement | null>(null);

  // O aviso de desfazer expira sozinho.
  useEffect(() => {
    if (!undoRow) return;
    const timer = window.setTimeout(() => setUndoRow(null), UNDO_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [undoRow]);

  const requestRegister = useCallback((row: KidsRow) => {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPendingRow(row);
  }, []);

  const closeDialog = useCallback(() => {
    setPendingRow(null);
    triggerRef.current?.focus();
  }, []);

  const confirmRegister = useCallback(() => {
    if (!pendingRow) return;
    onRegisterDegree?.(pendingRow.student.id);
    setUndoRow(pendingRow);
    setPendingRow(null);
    triggerRef.current?.focus();
  }, [onRegisterDegree, pendingRow]);

  const undo = useCallback(() => {
    if (!undoRow) return;
    onUndoDegree?.(undoRow.student.id);
    setUndoRow(null);
  }, [onUndoDegree, undoRow]);

  const onTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();

      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const nextTab = TABS[(index + offset + TABS.length) % TABS.length];
      if (!nextTab) return;

      setActiveTab(nextTab.id);
      tabRefs.current[nextTab.id]?.focus();
    },
    [],
  );

  const eligibleCount = kids.length;

  return (
    <section aria-labelledby="graduacao-titulo" className="w-full">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Painel do admin</p>
          <h1 id="graduacao-titulo" className="mt-2 text-3xl leading-none sm:text-4xl">
            Graduacao
          </h1>
        </div>

        <p
          aria-live="polite"
          className="surface-card px-4 py-3 text-sm text-muted sm:text-right"
        >
          <span className="font-display text-2xl leading-none text-crimson tabular-nums">
            {isLoading ? '--' : eligibleCount}
          </span>{' '}
          {pluralize(eligibleCount, 'crianca elegivel', 'criancas elegiveis')}
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Visoes da graduacao"
        className="mt-8 flex gap-1 overflow-x-auto border-b border-hairline"
      >
        {TABS.map((tab, index) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`painel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              className={cn(
                'relative min-h-[44px] whitespace-nowrap px-4 pb-3 pt-2 text-sm font-medium transition-colors duration-300',
                selected ? 'text-foreground' : 'text-muted hover:text-foreground',
              )}
            >
              {tab.label}
              {selected ? (
                <motion.span
                  layoutId={reduceMotion ? undefined : 'tab-indicator'}
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-crimson"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-8">
        {error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : (
          <>
            <div
              role="tabpanel"
              id="painel-kids"
              aria-labelledby="tab-kids"
              hidden={activeTab !== 'kids'}
              tabIndex={0}
            >
              {activeTab === 'kids' ? (
                <KidsPanel
                  kids={kids}
                  isLoading={isLoading}
                  onRequestRegister={requestRegister}
                />
              ) : null}
            </div>

            <div
              role="tabpanel"
              id="painel-adults"
              aria-labelledby="tab-adults"
              hidden={activeTab !== 'adults'}
              tabIndex={0}
            >
              {activeTab === 'adults' ? (
                <AdultsPanel adults={adults} isLoading={isLoading} />
              ) : null}
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {pendingRow ? (
          <ConfirmDialog
            key="confirmar-grau"
            row={pendingRow}
            onConfirm={confirmRegister}
            onCancel={closeDialog}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {undoRow ? (
          <motion.div
            key="desfazer"
            role="status"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: reduceMotion ? 0.15 : 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-4 bottom-5 z-40 mx-auto flex max-w-md items-center justify-between gap-4 rounded-2xl border border-hairline bg-surface-raised px-4 py-3 shadow-soft sm:inset-x-auto sm:right-6"
          >
            <p className="text-sm text-foreground">
              Grau {undoRow.result.nextDegree} registrado para{' '}
              <span className="font-medium">{undoRow.student.name}</span>.
            </p>
            <button
              type="button"
              onClick={undo}
              className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-crimson underline-offset-4 hover:underline"
            >
              Desfazer
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
