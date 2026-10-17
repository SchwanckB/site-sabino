'use client';

import { useState } from 'react';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { weekdayLabels, type ClassSlot, type Weekday } from '@/data/seed';
import { UNITS, UNIT_LABELS, UNIT_SHORT, type UnitId, type UnitScope } from '@/types/domain';
import { cn } from '@/lib/utils';

import { deleteClassAction, resetScheduleAction, saveClassAction } from '../actions';

const inputClass =
  'w-full min-h-[44px] rounded-xl border border-hairline bg-white/[.04] px-3 py-2 text-sm text-foreground focus:border-crimson focus:outline-none';

const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

const MODALITIES = [
  { id: 'jiu-jitsu', label: 'Jiu-Jitsu' },
  { id: 'mma', label: 'MMA' },
  { id: 'kids', label: 'Kids e Infantil' },
] as const;

/**
 * CRUD da grade. O que for salvo aqui aparece na landing page e passa a valer
 * para a janela de check-in dos alunos matriculados naquela turma.
 */
export function ScheduleEditor({
  classes,
  scope,
}: {
  readonly classes: readonly ClassSlot[];
  readonly scope: UnitScope;
}) {
  // Turma nova nasce na academia que o painel está mostrando. Em "todas",
  // cai na primeira — o campo fica visível para o professor corrigir.
  const unidadePadrao: UnitId = scope === 'todas' ? (UNITS[0] ?? 'tres-cachoeiras') : scope;
  const [editing, setEditing] = useState<ClassSlot | null>(null);
  const [creating, setCreating] = useState(false);

  const byDay = WEEKDAYS.map((weekday) => ({
    weekday,
    slots: classes
      .filter((slot) => slot.weekday === weekday)
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
  })).filter((group) => group.slots.length > 0);

  const form = (slot: ClassSlot | null, onClose: () => void) => (
    <ActionForm
      action={saveClassAction}
      className="surface-card mt-4 p-5"
      onDone={(result) => {
        if (result.ok) onClose();
      }}
    >
      {slot ? <input type="hidden" name="id" value={slot.id} /> : null}

      <h3 className="text-base normal-case tracking-normal">
        {slot ? 'Editar turma' : 'Nova turma'}
      </h3>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor={`title-${slot?.id ?? 'novo'}`} className="block text-xs text-muted">
            Nome da turma
          </label>
          <input
            id={`title-${slot?.id ?? 'novo'}`}
            name="title"
            type="text"
            required
            defaultValue={slot?.title ?? ''}
            placeholder="Jiu-Jitsu Kids"
            className={cn(inputClass, 'mt-1')}
          />
        </div>

        <div>
          <label htmlFor={`unit-${slot?.id ?? 'novo'}`} className="block text-xs text-muted">
            Academia
          </label>
          <select
            id={`unit-${slot?.id ?? 'novo'}`}
            name="unit"
            defaultValue={slot?.unit ?? unidadePadrao}
            className={cn(inputClass, 'mt-1')}
          >
            {UNITS.map((item) => (
              <option key={item} value={item}>
                {UNIT_LABELS[item]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`modality-${slot?.id ?? 'novo'}`} className="block text-xs text-muted">
            Modalidade
          </label>
          <select
            id={`modality-${slot?.id ?? 'novo'}`}
            name="modality"
            defaultValue={slot?.modality ?? 'jiu-jitsu'}
            className={cn(inputClass, 'mt-1')}
          >
            {MODALITIES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`weekday-${slot?.id ?? 'novo'}`} className="block text-xs text-muted">
            Dia da semana
          </label>
          <select
            id={`weekday-${slot?.id ?? 'novo'}`}
            name="weekday"
            defaultValue={slot?.weekday ?? 1}
            className={cn(inputClass, 'mt-1')}
          >
            {WEEKDAYS.map((day) => (
              <option key={day} value={day}>
                {weekdayLabels[day]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`start-${slot?.id ?? 'novo'}`} className="block text-xs text-muted">
            Início
          </label>
          <input
            id={`start-${slot?.id ?? 'novo'}`}
            name="startTime"
            type="time"
            required
            defaultValue={slot?.startTime ?? '19:30'}
            className={cn(inputClass, 'mt-1')}
          />
        </div>

        <div>
          <label htmlFor={`end-${slot?.id ?? 'novo'}`} className="block text-xs text-muted">
            Fim
          </label>
          <input
            id={`end-${slot?.id ?? 'novo'}`}
            name="endTime"
            type="time"
            required
            defaultValue={slot?.endTime ?? '20:30'}
            className={cn(inputClass, 'mt-1')}
          />
        </div>

        <div>
          <label htmlFor={`level-${slot?.id ?? 'novo'}`} className="block text-xs text-muted">
            Nível / faixa etária
          </label>
          <input
            id={`level-${slot?.id ?? 'novo'}`}
            name="level"
            type="text"
            defaultValue={slot?.level ?? ''}
            placeholder="Todos os níveis"
            className={cn(inputClass, 'mt-1')}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <SubmitButton>Salvar turma</SubmitButton>
        <button type="button" onClick={onClose} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </ActionForm>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            setCreating((open) => !open);
            setEditing(null);
          }}
          className="btn-primary"
        >
          {creating ? 'Fechar' : 'Adicionar turma'}
        </button>

        <ActionForm
          action={resetScheduleAction}
          confirm="Restaurar a grade padrão? As alterações feitas aqui serão perdidas."
        >
          <SubmitButton className="btn-ghost text-xs" pendingLabel="…">
            Restaurar grade padrão
          </SubmitButton>
        </ActionForm>
      </div>

      {creating ? form(null, () => setCreating(false)) : null}

      {byDay.length === 0 ? (
        <div className="surface-card mt-6 px-6 py-14 text-center">
          <p className="font-display text-lg uppercase tracking-tight">Grade vazia</p>
          <p className="mt-2 text-sm text-muted">Adicione a primeira turma.</p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {byDay.map(({ weekday, slots }) => (
            <li key={weekday} className="surface-card overflow-hidden">
              <h3 className="border-b border-hairline px-4 py-3 text-sm tracking-[0.16em] text-muted">
                {weekdayLabels[weekday]}
              </h3>
              <ul className="divide-y divide-hairline">
                {slots.map((slot) => (
                  <li key={slot.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="shrink-0 font-display text-base tabular-nums">
                        {slot.startTime}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{slot.title}</p>
                        <p className="truncate text-xs text-muted">
                          até {slot.endTime} · {slot.level}
                          {scope === 'todas' ? ` · ${UNIT_SHORT[slot.unit]}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(editing?.id === slot.id ? null : slot);
                          setCreating(false);
                        }}
                        className="btn-ghost text-xs"
                      >
                        {editing?.id === slot.id ? 'Fechar' : 'Editar'}
                      </button>

                      <ActionForm
                        action={deleteClassAction}
                        confirm={`Remover a turma ${slot.title} de ${weekdayLabels[weekday]}?`}
                      >
                        <input type="hidden" name="id" value={slot.id} />
                        <SubmitButton className="btn-ghost text-xs text-crimson" pendingLabel="…">
                          Remover
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {editing ? form(editing, () => setEditing(null)) : null}
    </div>
  );
}
