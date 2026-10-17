'use client';

import { useState } from 'react';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { cn } from '@/lib/utils';
import type { PublicStudent, UnitId } from '@/types/domain';
import { formatBr } from '@/utils/datetime';
import { DEFAULT_GRACE_DAYS } from '@/utils/paymentEngine';

import { approveStudentAction, rejectStudentAction } from '../actions';

export interface ClassOption {
  readonly id: string;
  readonly label: string;
  readonly weekday: string;
  readonly unit: UnitId;
}

const inputClass =
  'w-full min-h-[44px] rounded-xl border border-hairline bg-white/[.04] px-3 py-2 text-sm text-foreground focus:border-crimson focus:outline-none';

const KIDS_BELTS = ['branca', 'cinza', 'amarela', 'laranja', 'verde'];
const ADULT_BELTS = ['branca', 'azul', 'roxa', 'marrom', 'preta'];

/**
 * Ficha de aprovação: mostra os dados do pré-cadastro, deixa ver o documento
 * em uma rota autenticada e reúne, num envio só, as três decisões do admin —
 * turmas, graduação inicial e mensalidade.
 */
export function ApprovalCard({
  student,
  classOptions,
}: {
  readonly student: PublicStudent;
  readonly classOptions: readonly ClassOption[];
}) {
  const [showDocument, setShowDocument] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const belts = student.category === 'kids' ? KIDS_BELTS : ADULT_BELTS;
  // Só as turmas da academia do aluno: matricular um aluno de Terra de
  // Areia numa aula de Três Cachoeiras seria erro silencioso na chamada.
  const turmasDaUnidade = classOptions.filter((option) => option.unit === student.unit);
  const isMinor = student.age < 18;

  return (
    <li className="surface-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg normal-case tracking-normal">{student.name}</h3>
          <p className="mt-1 text-xs text-muted">
            {student.age} anos · {student.category === 'kids' ? 'Infantil' : 'Adulto'} ·
            cadastro em {formatBr(student.createdAt.slice(0, 10))}
          </p>
        </div>
        <span className="rounded-full bg-crimson/15 px-2.5 py-1 text-[11px] font-semibold text-crimson">
          Pendente
        </span>
      </div>

      <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">E-mail</dt>
          <dd className="break-words text-foreground">{student.email}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Telefone</dt>
          <dd className="text-foreground">{student.phone}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">CPF</dt>
          <dd className="font-mono text-foreground">{student.cpfMasked}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Nascimento</dt>
          <dd className="text-foreground">{formatBr(student.birthDate)}</dd>
        </div>
        {isMinor ? (
          <>
            <div>
              <dt className="text-xs text-muted">Responsável</dt>
              <dd className="text-foreground">{student.guardianName ?? '--'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Telefone do responsável</dt>
              <dd className="text-foreground">{student.guardianPhone ?? '--'}</dd>
            </div>
          </>
        ) : null}
      </dl>

      {student.hasDocument ? (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setShowDocument((open) => !open)}
            aria-expanded={showDocument}
            className="btn-secondary"
          >
            {showDocument ? 'Ocultar documento' : 'Ver documento'}
          </button>
          {showDocument ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-hairline bg-white/[.03]">
              <iframe
                src={`/api/admin/documento/${student.id}`}
                title={`Documento de ${student.name}`}
                className="h-[26rem] w-full border-0 bg-white"
              />
              <p className="border-t border-hairline px-3 py-2 text-[11px] text-muted">
                Documento pessoal — acesso restrito ao administrador e registrado apenas para a
                conferência da matrícula.
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-5 rounded-lg bg-crimson/10 px-3 py-2 text-xs text-crimson">
          Este cadastro não tem documento anexado.
        </p>
      )}

      {/* ---------------------------------------------------------------- */}

      <ActionForm action={approveStudentAction} className="mt-6 border-t border-hairline pt-6">
        <input type="hidden" name="studentId" value={student.id} />

        <fieldset>
          <legend className="text-sm font-medium text-foreground">Turmas do aluno</legend>
          <p className="mt-1 text-xs text-muted">
            Marque em quais aulas ele treina. É isso que libera o check-in no horário certo.
          </p>

          {classOptions.length === 0 ? (
            <p className="mt-3 text-xs text-crimson">
              Nenhuma turma na grade. Cadastre os horários antes de aprovar.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {turmasDaUnidade.map((option) => (
                <li key={option.id}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-hairline bg-white/[.03] px-3 py-2 text-sm transition-colors hover:border-white/20">
                    <input
                      type="checkbox"
                      name="classIds"
                      value={option.id}
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

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`belt-${student.id}`} className="block text-sm font-medium">
              Faixa inicial
            </label>
            <select
              id={`belt-${student.id}`}
              name="belt"
              defaultValue="branca"
              className={cn(inputClass, 'mt-2 capitalize')}
            >
              {belts.map((belt) => (
                <option key={belt} value={belt}>
                  {belt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`degree-${student.id}`} className="block text-sm font-medium">
              Graus
            </label>
            <input
              id={`degree-${student.id}`}
              name="degree"
              type="number"
              min={0}
              max={student.category === 'kids' ? 12 : 4}
              defaultValue={0}
              className={cn(inputClass, 'mt-2')}
            />
          </div>
        </div>

        <fieldset className="mt-6">
          <legend className="text-sm font-medium text-foreground">Mensalidade</legend>
          <p className="mt-1 text-xs text-muted">
            O que foi combinado com o aluno. Ex.: vence dia 11, com tolerância até o dia 15.
          </p>

          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor={`plan-${student.id}`} className="block text-xs text-muted">
                Tipo
              </label>
              <select
                id={`plan-${student.id}`}
                name="planId"
                defaultValue="mensal"
                className={cn(inputClass, 'mt-1.5')}
              >
                <option value="mensal">Mensal</option>
                <option value="trimestral">Trimestral</option>
                <option value="anual">Anual</option>
              </select>
            </div>

            <div>
              <label htmlFor={`amount-${student.id}`} className="block text-xs text-muted">
                Valor (R$)
              </label>
              <input
                id={`amount-${student.id}`}
                name="amount"
                type="text"
                inputMode="decimal"
                placeholder="150,00"
                className={cn(inputClass, 'mt-1.5')}
              />
            </div>

            <div>
              <label htmlFor={`dueDay-${student.id}`} className="block text-xs text-muted">
                Vence todo dia
              </label>
              <input
                id={`dueDay-${student.id}`}
                name="dueDay"
                type="number"
                min={1}
                max={31}
                defaultValue={10}
                className={cn(inputClass, 'mt-1.5')}
              />
            </div>

            <div>
              <label htmlFor={`grace-${student.id}`} className="block text-xs text-muted">
                Tolerância (dias)
              </label>
              <input
                id={`grace-${student.id}`}
                name="graceDays"
                type="number"
                min={0}
                max={28}
                defaultValue={DEFAULT_GRACE_DAYS}
                className={cn(inputClass, 'mt-1.5')}
              />
            </div>
          </div>
        </fieldset>

        <div className="mt-6">
          <label htmlFor={`notes-${student.id}`} className="block text-sm font-medium">
            Observações <span className="text-xs font-normal text-muted">(opcional)</span>
          </label>
          <textarea
            id={`notes-${student.id}`}
            name="notes"
            rows={2}
            className={cn(inputClass, 'mt-2 resize-y')}
          />
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <SubmitButton pendingLabel="Aprovando…">Aprovar matrícula</SubmitButton>
          <button
            type="button"
            onClick={() => setRejecting((open) => !open)}
            className="btn-secondary"
          >
            {rejecting ? 'Cancelar recusa' : 'Recusar'}
          </button>
        </div>
      </ActionForm>

      {rejecting ? (
        <ActionForm
          action={rejectStudentAction}
          className="mt-4 rounded-xl border border-crimson/40 bg-crimson/[.06] p-4"
          confirm="Recusar este cadastro?"
        >
          <input type="hidden" name="studentId" value={student.id} />
          <label htmlFor={`reason-${student.id}`} className="block text-sm font-medium">
            Motivo da recusa
          </label>
          <p className="mt-1 text-xs text-muted">O aluno verá esta mensagem e poderá corrigir.</p>
          <textarea
            id={`reason-${student.id}`}
            name="reason"
            rows={2}
            required
            className={cn(inputClass, 'mt-2 resize-y')}
          />
          <SubmitButton className="btn-secondary mt-3" pendingLabel="Recusando…">
            Confirmar recusa
          </SubmitButton>
        </ActionForm>
      ) : null}
    </li>
  );
}
