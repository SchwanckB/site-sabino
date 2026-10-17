'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { cn } from '@/lib/utils';
import { beltLabel } from '@/types/domain';
import { normalizeSearch } from '@/utils/searchText';

import { markPresenceInClassAction, undoPresenceAction } from '../actions';

export interface RosterRow {
  readonly id: string;
  readonly name: string;
  readonly belt: string;
  readonly degree: number;
  readonly present: boolean;
  readonly presentAt: string | null;
  /** Observação da ficha: lesão, restrição, combinado. Vazia na maioria. */
  readonly note: string;
  /** Está nas primeiras aulas — merece olhar do professor. */
  readonly isNew: boolean;
  /** Já pode graduar (trilha infantil) ou está no prazo (adulto). */
  readonly dueGraduation: boolean;
  /** Mensalidade vencida. */
  readonly overdue: boolean;
  /** Não é da turma: entrou como avulso ou está sendo chamado para ela. */
  readonly guest: boolean;
  readonly haystack: string;
}

/**
 * Lista da aula.
 *
 * Reúne numa linha só o que o professor hoje descobre em quatro telas: quem
 * é da turma, quem já bateu presença, quem está lesionado, quem é novo, quem
 * está em prazo de graduação e quem está devendo. No tatame não há tempo de
 * navegar — ou está aqui, ou não é consultado.
 */
export function ClassRoster({
  classId,
  rows,
  guests,
}: {
  readonly classId: string;
  readonly rows: readonly RosterRow[];
  /** Alunos ativos de fora da turma, para a presença avulsa. */
  readonly guests: readonly RosterRow[];
}) {
  const [search, setSearch] = useState('');
  const [addingGuest, setAddingGuest] = useState(false);

  const presentes = rows.filter((row) => row.present).length;

  const visiveis = useMemo(() => {
    const termo = normalizeSearch(search);
    if (termo.length === 0) return rows;
    return rows.filter((row) => row.haystack.includes(termo));
  }, [rows, search]);

  const convidados = useMemo(() => {
    const termo = normalizeSearch(search);
    if (!addingGuest || termo.length < 2) return [];
    return guests.filter((row) => row.haystack.includes(termo)).slice(0, 6);
  }, [guests, search, addingGuest]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm text-muted">
          <span className="font-display text-2xl leading-none tabular-nums text-crimson">
            {presentes}
          </span>{' '}
          de {rows.length} na chamada
        </p>

        <label className="w-full min-w-0 sm:w-64">
          <span className="sr-only">Buscar aluno</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar na turma…"
            className="min-h-[44px] w-full rounded-xl border border-hairline bg-white/[.04] px-3 text-sm text-foreground placeholder:text-muted/70 focus:border-crimson focus:outline-none"
          />
        </label>
      </div>

      {rows.length > 0 ? (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[.07]">
          <div
            className="h-full rounded-full bg-crimson transition-all"
            style={{ width: `${Math.round((presentes / rows.length) * 100)}%` }}
          />
        </div>
      ) : null}

      {visiveis.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          {rows.length === 0
            ? 'Nenhum aluno matriculado nesta turma ainda.'
            : 'Ninguém com esse nome na turma.'}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {visiveis.map((row) => (
            <RosterItem key={row.id} classId={classId} row={row} />
          ))}
        </ul>
      )}

      {/* Presença avulsa --------------------------------------------------- */}
      <div className="mt-6 border-t border-hairline pt-4">
        {addingGuest ? (
          <>
            <p className="text-sm text-foreground">Presença avulsa</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Para o aluno que veio treinar num dia que não é o dele. Busque pelo nome acima —
              a presença entra nesta turma sem mexer na matrícula.
            </p>

            {convidados.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {convidados.map((row) => (
                  <RosterItem key={row.id} classId={classId} row={row} />
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-muted">
                {search.trim().length < 2
                  ? 'Digite ao menos duas letras na busca acima.'
                  : 'Nenhum aluno de fora da turma com esse nome.'}
              </p>
            )}

            <button
              type="button"
              onClick={() => setAddingGuest(false)}
              className="btn-ghost mt-3 text-xs"
            >
              Fechar
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setAddingGuest(true)}
            className="btn-secondary text-sm"
          >
            Marcar aluno de outra turma
          </button>
        )}
      </div>
    </div>
  );
}

function RosterItem({
  classId,
  row,
}: {
  readonly classId: string;
  readonly row: RosterRow;
}) {
  return (
    <li
      className={cn(
        'rounded-xl border p-3 transition-colors',
        row.present
          ? 'border-emerald-500/35 bg-emerald-500/[.07]'
          : 'border-hairline bg-white/[.03]',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/admin/alunos/${row.id}`}
            className="block min-w-0 truncate text-sm font-medium text-foreground hover:text-crimson"
          >
            {row.name}
          </Link>
          <p className="mt-0.5 truncate text-xs text-muted">
            {beltLabel(row.belt)}
            {row.degree > 0 ? ` ${row.degree}º` : ''}
            {row.present && row.presentAt ? ` · presente ${row.presentAt}` : ''}
          </p>
        </div>

        {row.present ? (
          <ActionForm action={undoPresenceAction} confirm={`Desfazer a presença de ${row.name}?`}>
            <input type="hidden" name="studentId" value={row.id} />
            <SubmitButton className="btn-ghost text-xs" pendingLabel="…">
              Desfazer
            </SubmitButton>
          </ActionForm>
        ) : (
          <ActionForm action={markPresenceInClassAction}>
            <input type="hidden" name="studentId" value={row.id} />
            <input type="hidden" name="classId" value={classId} />
            <SubmitButton className="btn-primary text-xs" pendingLabel="…">
              {row.guest ? 'Marcar avulso' : 'Presente'}
            </SubmitButton>
          </ActionForm>
        )}
      </div>

      {/* Sinais ----------------------------------------------------------- */}
      {row.note.length > 0 || row.isNew || row.dueGraduation || row.overdue || row.guest ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {row.isNew ? <Tag tone="info">Primeiras aulas</Tag> : null}
          {row.dueGraduation ? <Tag tone="bom">Pode graduar</Tag> : null}
          {row.overdue ? <Tag tone="alerta">Mensalidade vencida</Tag> : null}
          {row.guest ? <Tag tone="info">Outra turma</Tag> : null}
        </div>
      ) : null}

      {/*
        A observação é o motivo de tudo isto existir: "joelho operado, evitar
        queda" precisa estar na frente do professor na hora da aula, não
        guardada numa ficha que ninguém abre no meio do treino.
      */}
      {row.note.length > 0 ? (
        <p className="mt-2 rounded-lg border border-amber-500/35 bg-amber-500/[.08] px-2.5 py-1.5 text-xs leading-relaxed text-amber-100">
          {row.note}
        </p>
      ) : null}
    </li>
  );
}

function Tag({
  tone,
  children,
}: {
  readonly tone: 'info' | 'bom' | 'alerta';
  readonly children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-medium',
        tone === 'alerta'
          ? 'bg-crimson/15 text-crimson'
          : tone === 'bom'
            ? 'bg-emerald-500/15 text-emerald-300'
            : 'bg-white/[.08] text-muted',
      )}
    >
      {children}
    </span>
  );
}
