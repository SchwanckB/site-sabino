'use client';

import { useState } from 'react';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { cn } from '@/lib/utils';
import { UNITS, UNIT_LABELS, UNIT_SHORT, type UnitId, type UnitScope } from '@/types/domain';

import { deleteOneOffClassAction, saveOneOffClassAction } from '../actions';

export interface OneOffView {
  readonly id: string;
  readonly dateLabel: string;
  readonly weekdayLabel: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly title: string;
  readonly level: string;
  readonly teacher: string;
  readonly unit: UnitId;
  readonly isToday: boolean;
  /** Quantos alunos ativos da unidade podem marcar presença nela. */
  readonly elegiveis: number;
}

const inputClass =
  'w-full min-h-[44px] rounded-xl border border-hairline bg-white/[.04] px-3 py-2 text-sm text-foreground focus:border-crimson focus:outline-none';

const MODALIDADES = [
  { id: 'jiu-jitsu', label: 'Jiu-Jitsu' },
  { id: 'mma', label: 'MMA' },
  { id: 'kids', label: 'Infantil' },
] as const;

/**
 * Turma avulsa: a aula que não está na grade e acontece num dia só.
 *
 * O treino de sábado de manhã aberto nesta semana, o seminário, o treino
 * extra antes do campeonato.
 *
 * O que a separa da aula personalizada logo acima: lá a turma **existe** na
 * grade e muda de horário num dia, e só quem a tem na ficha marca presença.
 * Aqui não existe turma na grade, logo não há matrícula para conferir — a
 * aula é aberta a todo aluno ativo da academia. Era o pedido: criar o sábado
 * e deixar quem aparecer marcar, sem pôr a aula na ficha de cada um.
 */
export function OneOffEditor({
  aulas,
  today,
  scope,
}: {
  readonly aulas: readonly OneOffView[];
  /** Hoje em São Paulo: piso do campo de data. */
  readonly today: string;
  readonly scope: UnitScope;
}) {
  const [creating, setCreating] = useState(false);

  // Com uma academia escolhida no cabeçalho, o campo de unidade some: ele
  // repetiria a escolha que o professor acabou de fazer.
  const unidadeFixa: UnitId | null = scope === 'todas' ? null : scope;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg uppercase tracking-tight">Turma avulsa</h2>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted">
            Uma aula que não está na grade e acontece num dia só — o treino de sábado de manhã,
            um seminário. <strong className="text-foreground">Qualquer aluno ativo da
            academia pode marcar presença</strong>, sem você precisar pôr a aula na ficha de
            cada um.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreating((open) => !open)}
          className="btn-secondary shrink-0 text-sm"
        >
          {creating ? 'Cancelar' : 'Criar turma avulsa'}
        </button>
      </div>

      {creating ? (
        <ActionForm
          action={saveOneOffClassAction}
          className="panel mt-4 p-5"
          onDone={(result) => {
            if (result.ok) setCreating(false);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label htmlFor="avulsa-title" className="block text-xs text-muted">
                Nome da aula
              </label>
              <input
                id="avulsa-title"
                name="title"
                type="text"
                required
                maxLength={60}
                placeholder="Treino de sábado"
                className={cn(inputClass, 'mt-1')}
              />
            </div>

            <div>
              <label htmlFor="avulsa-date" className="block text-xs text-muted">
                Dia
              </label>
              <input
                id="avulsa-date"
                name="date"
                type="date"
                required
                min={today}
                defaultValue={today}
                className={cn(inputClass, 'mt-1')}
              />
            </div>

            <div>
              <label htmlFor="avulsa-modality" className="block text-xs text-muted">
                Modalidade
              </label>
              <select id="avulsa-modality" name="modality" className={cn(inputClass, 'mt-1')}>
                {MODALIDADES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:col-span-2">
              <div>
                <label htmlFor="avulsa-start" className="block text-xs text-muted">
                  Início
                </label>
                <input
                  id="avulsa-start"
                  name="startTime"
                  type="time"
                  required
                  defaultValue="09:00"
                  className={cn(inputClass, 'mt-1')}
                />
              </div>
              <div>
                <label htmlFor="avulsa-end" className="block text-xs text-muted">
                  Fim
                </label>
                <input
                  id="avulsa-end"
                  name="endTime"
                  type="time"
                  required
                  defaultValue="10:30"
                  className={cn(inputClass, 'mt-1')}
                />
              </div>
            </div>

            <div>
              <label htmlFor="avulsa-level" className="block text-xs text-muted">
                Para quem <span className="text-muted/70">(opcional)</span>
              </label>
              <input
                id="avulsa-level"
                name="level"
                type="text"
                maxLength={60}
                placeholder="Todas as faixas"
                className={cn(inputClass, 'mt-1')}
              />
            </div>

            <div>
              <label htmlFor="avulsa-teacher" className="block text-xs text-muted">
                Professor <span className="text-muted/70">(opcional)</span>
              </label>
              <input
                id="avulsa-teacher"
                name="teacher"
                type="text"
                maxLength={60}
                className={cn(inputClass, 'mt-1')}
              />
            </div>

            {unidadeFixa ? (
              <input type="hidden" name="unit" value={unidadeFixa} />
            ) : (
              <div>
                <label htmlFor="avulsa-unit" className="block text-xs text-muted">
                  Academia
                </label>
                <select id="avulsa-unit" name="unit" className={cn(inputClass, 'mt-1')}>
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {UNIT_LABELS[unit]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-muted">
            O check-in abre uma hora antes do início e fecha uma hora depois do fim. A grade da
            semana não muda — esta aula vale só neste dia.
            {unidadeFixa ? ` Vai para ${UNIT_LABELS[unidadeFixa]}.` : ''}
          </p>

          <div className="mt-4">
            <SubmitButton>Criar turma avulsa</SubmitButton>
          </div>
        </ActionForm>
      ) : null}

      {aulas.length > 0 ? (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {aulas.map((aula) => (
            <li
              key={aula.id}
              className={cn(
                'panel p-4',
                aula.isToday ? 'border-crimson/40 bg-crimson/[.06]' : null,
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 truncate font-display text-base uppercase tracking-tight">
                  {aula.title}
                </p>
                {aula.isToday ? <span className="badge-warn shrink-0">Hoje</span> : null}
              </div>

              <p className="mt-1 text-sm text-foreground">
                {aula.weekdayLabel}, {aula.dateLabel} · {aula.startTime} às {aula.endTime}
              </p>

              <p className="mt-0.5 text-xs text-muted">
                {[
                  aula.level,
                  aula.teacher ? `com ${aula.teacher}` : '',
                  UNIT_SHORT[aula.unit],
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>

              <p className="mt-2 text-xs text-emerald-300">
                Aberta a {aula.elegiveis} {aula.elegiveis === 1 ? 'aluno' : 'alunos'} da academia
              </p>

              <ActionForm
                action={deleteOneOffClassAction}
                className="mt-3"
                confirm={`Remover "${aula.title}" de ${aula.dateLabel}? As presenças já lançadas continuam no histórico.`}
              >
                <input type="hidden" name="id" value={aula.id} />
                <SubmitButton className="btn-ghost text-xs" pendingLabel="…">
                  Remover
                </SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      ) : creating ? null : (
        <p className="mt-3 text-sm text-muted">Nenhuma turma avulsa marcada.</p>
      )}
    </section>
  );
}
