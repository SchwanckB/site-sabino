'use client';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { cn } from '@/lib/utils';
import {
  ADULT_BELTS,
  GENDER_LABELS,
  GENDERS,
  UNITS,
  UNIT_LABELS,
  KIDS_BELTS,
  STATUS_LABELS,
  USER_STATUSES,
} from '@/types/domain';
import type { Gender, UnitId, UserStatus } from '@/types/domain';

import {
  promoteBeltAction,
  registerDegreeAction,
  setStatusAction,
  undoDegreeAction,
  updateStudentAction,
} from '../../actions';
import type { ClassOption } from '../../aprovacoes/ApprovalCard';

const inputClass =
  'w-full min-h-[44px] rounded-xl border border-hairline bg-white/[.04] px-3 py-2 text-sm text-foreground focus:border-crimson focus:outline-none';

/**
 * Edição da ficha pelo administrador: turmas, graduação e situação.
 * Cada bloco é um formulário próprio para que um erro em um não descarte o
 * que já foi preenchido no outro.
 */
export function StudentEditor({
  studentId,
  belt,
  degree,
  notes,
  status,
  gender,
  unit,
  isKids,
  assignedClassIds,
  classOptions,
}: {
  readonly studentId: string;
  readonly belt: string;
  readonly degree: number;
  readonly notes: string;
  readonly status: UserStatus;
  readonly gender: Gender;
  readonly unit: UnitId;
  readonly isKids: boolean;
  readonly assignedClassIds: readonly string[];
  readonly classOptions: readonly ClassOption[];
}) {
  const belts = isKids ? KIDS_BELTS : ADULT_BELTS;
  const maxDegree = isKids ? 12 : 4;

  return (
    <div className="space-y-6">
      {/* Turmas, faixa e graus ------------------------------------------ */}
      <ActionForm action={updateStudentAction} className="surface-card p-5 sm:p-6">
        <input type="hidden" name="studentId" value={studentId} />
        <h2 className="text-lg normal-case tracking-normal">Turmas e graduação</h2>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium">Em quais aulas ele treina</legend>
          <p className="mt-1 text-xs text-muted">
            Define a janela em que o check-in dele é aceito.
          </p>

          {classOptions.length === 0 ? (
            <p className="mt-3 text-xs text-crimson">Nenhuma turma cadastrada na grade.</p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {classOptions.map((option) => (
                <li key={option.id}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-hairline bg-white/[.03] px-3 py-2 text-sm hover:border-white/20">
                    <input
                      type="checkbox"
                      name="classIds"
                      value={option.id}
                      defaultChecked={assignedClassIds.includes(option.id)}
                      className="h-4 w-4 shrink-0 accent-crimson"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-foreground">{option.label}</span>
                      <span className="block text-xs text-muted">{option.weekday}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="belt" className="block text-sm font-medium">
              Faixa
            </label>
            <select
              id="belt"
              name="belt"
              defaultValue={belt}
              className={cn(inputClass, 'mt-2 capitalize')}
            >
              {belts.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="degree" className="block text-sm font-medium">
              Graus (0 a {maxDegree})
            </label>
            <input
              id="degree"
              name="degree"
              type="number"
              min={0}
              max={maxDegree}
              defaultValue={degree}
              className={cn(inputClass, 'mt-2')}
            />
          </div>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="gender" className="block text-sm font-medium">
              Sexo
            </label>
            <select
              id="gender"
              name="gender"
              defaultValue={gender}
              className={cn(inputClass, 'mt-2')}
            >
              {GENDERS.map((value) => (
                <option key={value} value={value}>
                  {GENDER_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="unit" className="block text-sm font-medium">
              Academia
            </label>
            <select
              id="unit"
              name="unit"
              defaultValue={unit}
              className={cn(inputClass, 'mt-2')}
            >
              {UNITS.map((value) => (
                <option key={value} value={value}>
                  {UNIT_LABELS[value]}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-muted">
              Mudar de academia não transfere as turmas: reatribua abaixo.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <label htmlFor="notes" className="block text-sm font-medium">
            Observações
          </label>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Lesão, restrição médica, combinado de pagamento diferente, bolsa. Fica só aqui —
            o aluno não vê.
          </p>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            placeholder="Ex.: joelho direito operado em 2025, evitar queda. Paga sempre dia 20."
            defaultValue={notes}
            className={cn(inputClass, 'mt-2 resize-y')}
          />
        </div>

        <SubmitButton className="btn-primary mt-5">Salvar alterações</SubmitButton>
      </ActionForm>

      {/* Graduação rápida ----------------------------------------------- */}
      <div className="surface-card p-5 sm:p-6">
        <h2 className="text-lg normal-case tracking-normal">Registrar graduação</h2>

        {isKids ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <ActionForm action={registerDegreeAction}>
              <input type="hidden" name="studentId" value={studentId} />
              <SubmitButton pendingLabel="Registrando…">
                Registrar grau {Math.min(degree + 1, 12)}
              </SubmitButton>
            </ActionForm>

            <ActionForm action={undoDegreeAction} confirm="Desfazer a última graduação?">
              <input type="hidden" name="studentId" value={studentId} />
              <SubmitButton className="btn-secondary" pendingLabel="…">
                Desfazer última
              </SubmitButton>
            </ActionForm>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Alunos adultos não têm promoção automática — a troca de faixa é decisão do
            professor.
          </p>
        )}

        <ActionForm
          action={promoteBeltAction}
          className="mt-5 border-t border-hairline pt-5"
          confirm="Promover de faixa? Os graus voltam para zero."
        >
          <input type="hidden" name="studentId" value={studentId} />
          <p className="text-sm font-medium">Promover de faixa</p>
          <p className="mt-1 text-xs text-muted">Zera os graus e registra no histórico.</p>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="newBelt" className="block text-xs text-muted">
                Nova faixa
              </label>
              <select id="newBelt" name="belt" className={cn(inputClass, 'mt-1 w-36 capitalize')}>
                {belts.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[12rem] flex-1">
              <label htmlFor="note" className="block text-xs text-muted">
                Observação (opcional)
              </label>
              <input id="note" name="note" type="text" className={cn(inputClass, 'mt-1')} />
            </div>

            <SubmitButton className="btn-secondary">Promover</SubmitButton>
          </div>
        </ActionForm>
      </div>

      {/* Situação --------------------------------------------------------- */}
      <ActionForm
        action={setStatusAction}
        className="surface-card p-5 sm:p-6"
        confirm="Alterar a situação deste aluno?"
      >
        <input type="hidden" name="studentId" value={studentId} />
        <h2 className="text-lg normal-case tracking-normal">Situação do cadastro</h2>
        <p className="mt-1 text-xs text-muted">
          Alunos fora de &ldquo;ativo&rdquo; perdem o acesso ao painel e saem das listas de
          presença e cobrança.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="status" className="sr-only">
              Situação
            </label>
            <select
              id="status"
              name="status"
              defaultValue={status}
              className={cn(inputClass, 'w-52')}
            >
              {USER_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {STATUS_LABELS[item]}
                </option>
              ))}
            </select>
          </div>
          <SubmitButton className="btn-secondary">Atualizar situação</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
