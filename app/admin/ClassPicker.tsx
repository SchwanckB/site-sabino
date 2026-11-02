'use client';

import { useState } from 'react';

import type { ModalityId } from '@/data/seed';
import { cn } from '@/lib/utils';
import { UNIT_LABELS, type UnitId } from '@/types/domain';

/** Uma turma da grade, do jeito que as telas de matrícula precisam vê-la. */
export interface ClassOption {
  readonly id: string;
  /** Nome e nível: `MMA · Todos os níveis`. */
  readonly label: string;
  /** Dia e horário já formatados: `Segunda, 19:30 às 20:30`. */
  readonly weekday: string;
  readonly unit: UnitId;
  readonly modality: ModalityId;
  readonly teacher: string;
}

/**
 * Ordem das modalidades.
 *
 * Fixa, e não alfabética nem vinda da grade: é a ordem em que a academia
 * vende, e assim a tela não muda de ordem quando uma turma é criada.
 */
const MODALIDADES: readonly { readonly id: ModalityId; readonly label: string }[] = [
  { id: 'jiu-jitsu', label: 'Jiu-Jitsu' },
  { id: 'mma', label: 'MMA' },
  { id: 'kids', label: 'Kids e Infantil' },
];

/**
 * Seleção das turmas de um aluno, agrupada por modalidade.
 *
 * Era uma lista corrida de todas as turmas da grade. Com duas academias e
 * três modalidades isso passa de vinte linhas, e matricular alguém em
 * Jiu-Jitsu virava uma varredura visual para achar as quatro que importam —
 * quando o professor pensa primeiro na modalidade ("ele vai fazer MMA") e só
 * depois no horário.
 *
 * Duas regras que a lista antiga não tinha:
 *
 *  1. **Só a academia do aluno.** Marcar um aluno de Terra de Areia numa
 *     turma de Três Cachoeiras é erro silencioso: a aula nunca abre o
 *     check-in dele, e nada na tela explica por quê.
 *  2. **Modalidade sem turma não aparece.** Um bloco vazio só ocupa espaço.
 *
 * Os `details` ficam abertos quando já há turma marcada ali: ao editar a
 * ficha de um aluno, o professor precisa ver o que está valendo sem clicar.
 */
export function ClassPicker({
  classOptions,
  unit,
  initialSelected = [],
  name = 'classIds',
}: {
  readonly classOptions: readonly ClassOption[];
  /** Academia do aluno: a lista é filtrada por ela. */
  readonly unit: UnitId;
  readonly initialSelected?: readonly string[];
  readonly name?: string;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(initialSelected));

  const daUnidade = classOptions.filter((option) => option.unit === unit);

  const grupos = MODALIDADES.map((modalidade) => ({
    ...modalidade,
    turmas: daUnidade.filter((option) => option.modality === modalidade.id),
  })).filter((grupo) => grupo.turmas.length > 0);

  if (daUnidade.length === 0) {
    return (
      <p className="mt-3 text-xs text-crimson">
        {classOptions.length === 0
          ? 'Nenhuma turma na grade. Cadastre os horários antes de matricular.'
          : `Nenhuma turma cadastrada em ${UNIT_LABELS[unit]}. Cadastre os horários desta academia primeiro.`}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {grupos.map((grupo) => {
        const marcadas = grupo.turmas.filter((turma) => selected.has(turma.id)).length;

        return (
          <details key={grupo.id} className="panel overflow-hidden" open={marcadas > 0}>
            <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-sm font-medium text-foreground">{grupo.label}</span>
              <span className={marcadas > 0 ? 'badge-ok' : 'badge-neutral'}>
                {marcadas > 0
                  ? `${marcadas} ${marcadas === 1 ? 'marcada' : 'marcadas'}`
                  : `${grupo.turmas.length} ${grupo.turmas.length === 1 ? 'horário' : 'horários'}`}
              </span>
            </summary>

            <ul className="grid gap-2 border-t border-hairline p-3 sm:grid-cols-2">
              {grupo.turmas.map((option) => (
                <li key={option.id}>
                  <label
                    className={cn(
                      'flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors',
                      selected.has(option.id)
                        ? 'border-crimson/50 bg-crimson/[.07]'
                        : 'border-hairline bg-white/[.03] hover:border-white/20',
                    )}
                  >
                    <input
                      type="checkbox"
                      name={name}
                      value={option.id}
                      checked={selected.has(option.id)}
                      onChange={(event) => {
                        setSelected((atual) => {
                          const proximo = new Set(atual);
                          if (event.target.checked) proximo.add(option.id);
                          else proximo.delete(option.id);
                          return proximo;
                        });
                      }}
                      className="h-4 w-4 shrink-0 accent-crimson"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-foreground">{option.weekday}</span>
                      <span className="block truncate text-xs text-muted">
                        {option.label}
                        {option.teacher ? ` · ${option.teacher}` : ''}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </details>
        );
      })}

      <p aria-live="polite" className="text-xs text-muted">
        {selected.size === 0
          ? 'Nenhuma turma marcada ainda.'
          : `${selected.size} ${selected.size === 1 ? 'turma marcada' : 'turmas marcadas'} em ${UNIT_LABELS[unit]}.`}
      </p>
    </div>
  );
}
