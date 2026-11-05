'use client';

import Link from 'next/link';
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
  /** Turma a que a presença ficou vinculada. */
  readonly presentClass: string | null;
  /**
   * Id da turma da presença, para o desfazer saber qual apagar.
   *
   * Sem ele, desfazer na visão geral procurava a trava `sem-turma` e devolvia
   * "não havia presença nesta aula" para um aluno que a tela mostrava
   * presente. `null` é legítimo: é a presença que ficou sem turma resolvida.
   */
  readonly presentClassId: string | null;
  /**
   * Turma do aluno aberta agora, se houver.
   *
   * Vai no formulário de marcar da visão geral para a presença nascer
   * vinculada, em vez de depender da inferência pelo relógio lá dentro.
   */
  readonly openClassId: string | null;
  /**
   * Presença de hoje em **outra** turma.
   *
   * Não marca esta chamada — presença é por aula realizada. Serve para o
   * professor não achar que o sistema perdeu o check-in de quem ele viu
   * entrando na academia mais cedo.
   */
  readonly elsewhere: string | null;
  /** Turmas em que o aluno está matriculado, para o resumo por turma. */
  readonly classIds: readonly string[];
}

export interface TurmaResumo {
  readonly id: string;
  readonly label: string;
  readonly weekdayLabel: string;
  readonly startTime: string;
  readonly title: string;
  readonly openNow: boolean;
  /** `false` quando a turma é de outro dia da semana. */
  readonly happensToday: boolean;
  readonly total: number;
  readonly presentes: number;
}

type Filter = 'aula_agora' | 'todos' | 'faltantes';

const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: 'aula_agora', label: 'Com aula agora' },
  { id: 'faltantes', label: 'Ainda sem presença' },
  { id: 'todos', label: 'Todos os ativos' },
];

/**
 * Chamada.
 *
 * Dois modos. Sem turma escolhida é a visão da academia: todo mundo ativo, e
 * "presente" significa qualquer presença de hoje. Escolhendo uma turma nos
 * cartões de cima, vira a chamada **dela** — só os matriculados, e o check
 * verde é a presença naquela aula.
 *
 * O segundo modo é o que resolve o treino já encerrado: a turma vai no
 * formulário, então a presença fica vinculada a ela mesmo horas depois, sem
 * depender do relógio. E é o que conserta o engano de ver a marca de uma aula
 * aparecer na chamada de outra.
 */
export function PresenceList({
  rows,
  todayLabel,
  turmas,
  selected,
}: {
  readonly rows: readonly PresenceRow[];
  readonly todayLabel: string;
  readonly turmas: readonly TurmaResumo[];
  /** Turma aberta para chamada, ou `null` na visão geral. */
  readonly selected: TurmaResumo | null;
}) {
  const [filter, setFilter] = useState<Filter>(selected ? 'todos' : 'aula_agora');
  const [search, setSearch] = useState('');
  const [selecionados, setSelecionados] = useState<ReadonlySet<string>>(new Set());

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (term.length > 0 && !row.name.toLowerCase().includes(term)) return false;
      if (filter === 'aula_agora') return row.inClassNow !== null;
      if (filter === 'faltantes') return !row.present;
      return true;
    });
  }, [rows, filter, search]);

  const marcaveis = visible.filter((row) => !row.present);
  const todosMarcados = marcaveis.length > 0 && marcaveis.every((row) => selecionados.has(row.id));

  const toggle = (id: string): void => {
    setSelecionados((atual) => {
      const next = new Set(atual);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (): void => {
    setSelecionados((atual) => {
      const next = new Set(atual);
      if (todosMarcados) for (const row of marcaveis) next.delete(row.id);
      else for (const row of marcaveis) next.add(row.id);
      return next;
    });
  };

  const presentCount = rows.filter((row) => row.present).length;

  const deHoje = turmas.filter((turma) => turma.happensToday);
  const deOutroDia = turmas.filter((turma) => !turma.happensToday);

  return (
    <div>
      <div className="panel flex flex-wrap items-center justify-between gap-4 p-4">
        <p aria-live="polite" className="text-sm text-muted">
          <span className="font-display text-2xl leading-none text-crimson tabular-nums">
            {presentCount}
          </span>{' '}
          {selected
            ? `de ${rows.length} na chamada`
            : presentCount === 1
              ? 'presença hoje'
              : 'presenças hoje'}{' '}
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
        Os cartões de turma eram só leitura — mostravam "kids 8/12" e o
        professor não tinha onde clicar para fazer a chamada daquela aula.
        Agora cada um abre a chamada da turma.
      */}
      {turmas.length > 0 ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="panel-title">
              {selected ? 'Trocar de turma' : 'Escolha a turma para fazer a chamada'}
            </p>
            {selected ? (
              <Link href="/admin/presenca" className="btn-ghost text-xs">
                Ver a academia toda
              </Link>
            ) : null}
          </div>

          <TurmaGrid turmas={deHoje} selected={selected} />

          {deOutroDia.length > 0 ? (
            <details className="mt-3 group">
              <summary className="cursor-pointer list-none text-xs text-muted hover:text-foreground">
                + {deOutroDia.length} turma{deOutroDia.length === 1 ? '' : 's'} de outro dia da
                semana
              </summary>
              <div className="mt-2">
                <TurmaGrid turmas={deOutroDia} selected={selected} />
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      {/* Chamada da turma escolhida ------------------------------------- */}
      {selected ? (
        <div
          className={cn(
            'mt-4 rounded-xl border p-4',
            selected.happensToday
              ? 'border-crimson/40 bg-crimson/[.06]'
              : 'border-amber-500/40 bg-amber-500/[.06]',
          )}
        >
          <p className="font-display text-lg uppercase leading-tight tracking-tight">
            Chamada · {selected.weekdayLabel} {selected.startTime} · {selected.title}
          </p>

          {selected.happensToday ? (
            <p className="mt-1 text-xs leading-relaxed text-muted">
              A presença entra vinculada a esta turma, mesmo depois do horário do treino.
            </p>
          ) : (
            /*
              Marcar numa turma de outro dia grava com a data de HOJE. É
              legítimo (a turma pode ter treinado fora do dia dela), mas o
              relatório de frequência vai contar essa aula num dia em que ela
              não acontece — e isso tem de estar escrito antes do clique.
            */
            <p className="mt-2 text-xs leading-relaxed text-amber-300">
              Esta turma não acontece hoje. A presença será gravada com a data de{' '}
              <strong>hoje</strong> vinculada a ela. Se o treino foi mesmo em outro dia, prefira
              abrir a turma de hoje.
            </p>
          )}
        </div>
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

      {/* Presença em lote ---------------------------------------------- */}
      {marcaveis.length > 0 ? (
        <ActionForm action={markPresenceBatchAction} className="mt-5">
          {/* A turma vai junto: é ela que tira a presença da dependência do relógio. */}
          {selected ? <input type="hidden" name="classId" value={selected.id} /> : null}

          <div className="panel flex flex-wrap items-center justify-between gap-4 p-4">
            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={todosMarcados}
                onChange={toggleAll}
                className="h-5 w-5 accent-crimson"
              />
              <span className="text-foreground">
                Selecionar todos os visíveis ({marcaveis.length})
              </span>
            </label>

            <div className="flex items-center gap-3">
              <span aria-live="polite" className="text-sm tabular-nums text-muted">
                {selecionados.size} selecionado{selecionados.size === 1 ? '' : 's'}
              </span>
              <SubmitButton
                className={cn(
                  'btn-primary',
                  selecionados.size === 0 && 'pointer-events-none opacity-50',
                )}
                pendingLabel="Marcando…"
              >
                {selected ? 'Marcar presença na turma' : 'Marcar presença em lote'}
              </SubmitButton>
            </div>
          </div>

          {[...selecionados].map((id) => (
            <input key={id} type="hidden" name="studentIds" value={id} />
          ))}
        </ActionForm>
      ) : null}

      {visible.length === 0 ? (
        <div className="panel mt-5 px-6 py-14 text-center">
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
                'panel flex flex-wrap items-center gap-3 p-3 sm:p-4',
                row.present && 'border-emerald-500/30 bg-emerald-500/[.05]',
              )}
            >
              {!row.present ? (
                <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
                  <span className="sr-only">Selecionar {row.name}</span>
                  <input
                    type="checkbox"
                    checked={selecionados.has(row.id)}
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
                  {!selected && row.inClassNow ? ` · ${row.inClassNow}` : ''}
                  {row.present && row.presentSource
                    ? ` · presente às ${row.presentAt}${
                        !selected && row.presentClass ? ` em ${row.presentClass}` : ''
                      } (${CHECKIN_SOURCE_LABELS[row.presentSource]})`
                    : ''}
                  {row.elsewhere ? ` · ${row.elsewhere}` : ''}
                </p>
              </div>

              {row.present ? (
                <ActionForm
                  action={undoPresenceAction}
                  className="shrink-0"
                  confirm={`Remover a presença de ${row.name}?`}
                >
                  <input type="hidden" name="studentId" value={row.id} />
                  {/*
                    Qual presença some. Na chamada de uma turma é a dela; na
                    visão geral é a turma da presença que a linha mostra — e
                    não o campo vazio, que procuraria a trava `sem-turma`.
                  */}
                  {row.presentClassId ? (
                    <input type="hidden" name="classId" value={row.presentClassId} />
                  ) : null}
                  <SubmitButton className="btn-ghost text-xs" pendingLabel="…">
                    Desfazer
                  </SubmitButton>
                </ActionForm>
              ) : (
                <ActionForm action={markPresenceAction} className="shrink-0">
                  <input type="hidden" name="studentId" value={row.id} />
                  {/*
                    Na visão geral vai a turma aberta do aluno: deixar em
                    branco faria a presença nascer sem turma fora da janela, e
                    presença sem turma some do relatório de frequência.
                  */}
                  {selected || row.openClassId ? (
                    <input
                      type="hidden"
                      name="classId"
                      value={selected ? selected.id : (row.openClassId ?? '')}
                    />
                  ) : null}
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

/** Os cartões de turma, com o fechamento de cada uma. */
function TurmaGrid({
  turmas,
  selected,
}: {
  readonly turmas: readonly TurmaResumo[];
  readonly selected: TurmaResumo | null;
}) {
  if (turmas.length === 0) {
    return <p className="mt-2 text-sm text-muted">Nenhuma turma com aluno matriculado hoje.</p>;
  }

  return (
    <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {turmas.map((turma) => {
        const proporcao = turma.total === 0 ? 0 : turma.presentes / turma.total;
        const ativa = selected?.id === turma.id;

        return (
          <li key={turma.id} className="min-w-0">
            <Link
              href={ativa ? '/admin/presenca' : `/admin/presenca?turma=${turma.id}`}
              aria-current={ativa ? 'true' : undefined}
              className={cn(
                'block min-w-0 rounded-xl border p-3 transition-colors',
                ativa
                  ? 'border-crimson bg-crimson/20'
                  : turma.openNow
                    ? 'border-crimson/40 bg-crimson/[.07] hover:border-crimson/70'
                    : 'border-hairline bg-white/[.03] hover:border-white/25',
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
              {turma.openNow ? (
                <p className="mt-1.5 text-[11px] text-crimson">acontecendo agora</p>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
