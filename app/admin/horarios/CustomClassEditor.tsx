'use client';

import { useState } from 'react';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { weekdayShortLabels, type ClassSlot, type Weekday } from '@/data/seed';
import { UNIT_SHORT, type UnitScope } from '@/types/domain';
import { cn } from '@/lib/utils';

import { deleteClassOverrideAction, saveClassOverrideAction } from '../actions';

const inputClass =
  'w-full min-h-[44px] rounded-xl border border-hairline bg-white/[.04] px-3 py-2 text-sm text-foreground focus:border-crimson focus:outline-none';

/** Uma aula personalizada já gravada, pronta para a tela. */
export interface CustomClassView {
  readonly id: string;
  readonly classId: string;
  readonly classTitle: string;
  /** `DD/MM/AAAA`. */
  readonly dateLabel: string;
  readonly weekdayLabel: string;
  readonly startTime: string;
  readonly endTime: string;
  /** Horário da grade, para o professor ver o que mudou. */
  readonly normalTime: string;
  readonly note: string;
  readonly isToday: boolean;
}

/**
 * Aula personalizada: a turma em outro horário, num dia só.
 *
 * A grade não é tocada — no dia seguinte a turma volta ao horário normal
 * sozinha, e o site continua anunciando a grade de verdade. No dia marcado, o
 * check-in do aluno passa a valer no horário novo (e abre uma hora antes
 * dele), e o horário normal daquele dia deixa de aceitar presença.
 */
export function CustomClassEditor({
  classes,
  overrides,
  today,
  scope,
}: {
  readonly classes: readonly ClassSlot[];
  readonly overrides: readonly CustomClassView[];
  /** `YYYY-MM-DD` em São Paulo — o relógio do navegador não decide isto. */
  readonly today: string;
  readonly scope: UnitScope;
}) {
  const [creating, setCreating] = useState(false);
  const [classId, setClassId] = useState(classes[0]?.id ?? '');

  const selected = classes.find((slot) => slot.id === classId) ?? null;

  const ordered = [...classes].sort(
    (a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime),
  );

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg uppercase tracking-tight">Aulas personalizadas</h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Mude o horário de uma turma em um dia só, sem alterar a grade. Serve para hoje ou
            para um dia à frente — no dia seguinte a turma volta ao horário normal sozinha.
          </p>
        </div>

        {classes.length > 0 ? (
          <button
            type="button"
            onClick={() => setCreating((open) => !open)}
            className="btn-primary"
          >
            {creating ? 'Fechar' : 'Nova aula personalizada'}
          </button>
        ) : null}
      </div>

      {creating && selected ? (
        <ActionForm
          action={saveClassOverrideAction}
          className="surface-card mt-4 p-5"
          onDone={(result) => {
            if (result.ok) setCreating(false);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label htmlFor="override-class" className="block text-xs text-muted">
                Turma
              </label>
              <select
                id="override-class"
                name="classId"
                value={classId}
                onChange={(event) => setClassId(event.target.value)}
                className={cn(inputClass, 'mt-1')}
              >
                {ordered.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {weekdayShortLabels[slot.weekday as Weekday]} {slot.startTime} · {slot.title}
                    {scope === 'todas' ? ` · ${UNIT_SHORT[slot.unit]}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="override-date" className="block text-xs text-muted">
                Dia
              </label>
              <input
                id="override-date"
                name="date"
                type="date"
                required
                min={today}
                defaultValue={today}
                className={cn(inputClass, 'mt-1')}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/*
                `key` na turma: trocar a turma no select precisa redesenhar os
                campos de hora para o `defaultValue` novo entrar. Sem isso o
                professor escolhia o Kids e salvava com o horário do MMA.
              */}
              <div key={`start-${selected.id}`}>
                <label htmlFor="override-start" className="block text-xs text-muted">
                  Início
                </label>
                <input
                  id="override-start"
                  name="startTime"
                  type="time"
                  required
                  defaultValue={selected.startTime}
                  className={cn(inputClass, 'mt-1')}
                />
              </div>

              <div key={`end-${selected.id}`}>
                <label htmlFor="override-end" className="block text-xs text-muted">
                  Fim
                </label>
                <input
                  id="override-end"
                  name="endTime"
                  type="time"
                  required
                  defaultValue={selected.endTime}
                  className={cn(inputClass, 'mt-1')}
                />
              </div>
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <label htmlFor="override-note" className="block text-xs text-muted">
                Recado (opcional)
              </label>
              <input
                id="override-note"
                name="note"
                type="text"
                maxLength={140}
                placeholder="Hoje mais cedo por causa do evento"
                className={cn(inputClass, 'mt-1')}
              />
            </div>
          </div>

          <p className="mt-3 text-xs text-muted">
            Horário normal desta turma: {weekdayShortLabels[selected.weekday as Weekday]}{' '}
            {selected.startTime} às {selected.endTime}. O check-in abre uma hora antes do início
            que você salvar e fecha 15 minutos depois do fim.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <SubmitButton>Salvar aula personalizada</SubmitButton>
            <button type="button" onClick={() => setCreating(false)} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </ActionForm>
      ) : null}

      {overrides.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          Nenhuma aula personalizada marcada. Todas as turmas acontecem no horário da grade.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {overrides.map((item) => (
            <li key={item.id} className="surface-card p-4">
              <div className="flex items-center gap-2">
                <span className="font-display text-base tabular-nums">
                  {item.startTime} às {item.endTime}
                </span>
                {item.isToday ? (
                  <span className="rounded-full bg-crimson px-2 py-0.5 text-[11px] font-semibold text-foreground">
                    Hoje
                  </span>
                ) : null}
              </div>

              <p className="mt-1 truncate text-sm text-foreground">{item.classTitle}</p>
              <p className="text-xs text-muted">
                {item.weekdayLabel}, {item.dateLabel} · normal {item.normalTime}
              </p>
              {item.note ? <p className="mt-2 text-xs text-muted">{item.note}</p> : null}

              <ActionForm
                action={deleteClassOverrideAction}
                className="mt-3"
                confirm={`Remover a aula personalizada de ${item.dateLabel}? A turma volta para o horário ${item.normalTime}.`}
              >
                <input type="hidden" name="id" value={item.id} />
                <SubmitButton className="btn-ghost text-xs text-crimson" pendingLabel="…">
                  Remover
                </SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
