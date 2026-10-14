'use client';

import { useMemo, useState } from 'react';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { cn } from '@/lib/utils';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from '@/types/domain';
import { formatBr } from '@/utils/datetime';
import { formatCents, PLAN_LABELS, type PaymentStatus, type PlanId } from '@/utils/paymentEngine';

import { registerPaymentAction, undoPaymentAction, updatePlanAction } from '../actions';

export interface FinanceRow {
  readonly id: string;
  readonly name: string;
  readonly planId: PlanId;
  readonly amountCents: number;
  readonly dueDate: string;
  readonly limitDate: string;
  readonly dueDay: number;
  readonly graceDays: number;
  readonly status: PaymentStatus;
  readonly openInstallments: number;
  readonly totalOpenCents: number;
  readonly lastPaidAt: string | null;
  readonly hasPlan: boolean;
}

type Filter = 'vencidas' | 'em_breve' | 'todos' | 'sem_plano';

const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: 'vencidas', label: 'Inadimplentes' },
  { id: 'em_breve', label: 'Vencem em breve' },
  { id: 'todos', label: 'Todos' },
  { id: 'sem_plano', label: 'Sem mensalidade' },
];

const STATUS_STYLE: Readonly<Record<PaymentStatus, string>> = {
  em_dia: 'border-emerald-500/30 bg-emerald-500/[.05]',
  vence_em_breve: 'border-amber-500/30 bg-amber-500/[.05]',
  vencida: 'border-crimson/40 bg-crimson/[.06]',
};

const STATUS_LABEL: Readonly<Record<PaymentStatus, string>> = {
  em_dia: 'Em dia',
  vence_em_breve: 'Vence em breve',
  vencida: 'Vencida',
};

const inputClass =
  'w-full min-h-[44px] rounded-xl border border-hairline bg-white/[.04] px-3 py-2 text-sm text-foreground focus:border-crimson focus:outline-none';

export function FinanceList({ rows }: { readonly rows: readonly FinanceRow[] }) {
  const [filter, setFilter] = useState<Filter>('vencidas');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (term.length > 0 && !row.name.toLowerCase().includes(term)) return false;
      if (filter === 'sem_plano') return !row.hasPlan;
      if (!row.hasPlan) return false;
      if (filter === 'vencidas') return row.status === 'vencida';
      if (filter === 'em_breve') return row.status === 'vence_em_breve';
      return true;
    });
  }, [rows, filter, search]);

  const overdue = rows.filter((row) => row.hasPlan && row.status === 'vencida');
  const totalOpen = overdue.reduce((sum, row) => sum + row.totalOpenCents, 0);

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface-card p-4">
          <p className="text-xs text-muted">Inadimplentes</p>
          <p className="mt-1 font-display text-3xl leading-none tabular-nums text-crimson">
            {overdue.length}
          </p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs text-muted">Total em aberto</p>
          <p className="mt-1 font-display text-3xl leading-none tabular-nums">
            {formatCents(totalOpen)}
          </p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs text-muted">Alunos com mensalidade</p>
          <p className="mt-1 font-display text-3xl leading-none tabular-nums">
            {rows.filter((row) => row.hasPlan).length}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div role="group" aria-label="Filtrar" className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              aria-pressed={filter === item.id}
              className={cn(
                'inline-flex min-h-[44px] items-center rounded-xl border px-4 text-sm font-medium transition-colors',
                filter === item.id
                  ? 'border-crimson bg-crimson text-foreground'
                  : 'border-hairline bg-white/[.04] text-muted hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <label>
          <span className="sr-only">Buscar aluno</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome…"
            className={cn(inputClass, 'sm:w-64')}
          />
        </label>
      </div>

      <p aria-live="polite" className="mt-4 text-sm text-muted">
        {visible.length} {visible.length === 1 ? 'aluno' : 'alunos'}
      </p>

      {visible.length === 0 ? (
        <div className="surface-card mt-4 px-6 py-14 text-center">
          <p className="font-display text-lg uppercase tracking-tight">Nada por aqui</p>
          <p className="mt-2 text-sm text-muted">
            {filter === 'vencidas'
              ? 'Nenhuma mensalidade vencida. Tudo em dia.'
              : 'Ajuste o filtro ou a busca.'}
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {visible.map((row) => (
            <li
              key={row.id}
              className={cn(
                'rounded-2xl border p-4 backdrop-blur-md sm:p-5',
                row.hasPlan ? STATUS_STYLE[row.status] : 'border-hairline bg-white/[.04]',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
                  {row.hasPlan ? (
                    <p className="mt-1 text-xs text-muted">
                      {PLAN_LABELS[row.planId]} · {formatCents(row.amountCents)} · vence dia{' '}
                      {row.dueDay}
                      {row.graceDays > 0 ? ` (até o dia ${row.dueDay + row.graceDays})` : ''}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-crimson">Mensalidade não definida</p>
                  )}
                </div>

                {row.hasPlan ? (
                  <span className="shrink-0 rounded-full border border-current/30 px-2.5 py-1 text-[11px] font-semibold">
                    {STATUS_LABEL[row.status]}
                  </span>
                ) : null}
              </div>

              {row.hasPlan ? (
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/10 pt-4 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-muted">Vencimento</dt>
                    <dd className="mt-0.5 tabular-nums text-foreground">
                      {formatBr(row.dueDate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Paga até</dt>
                    <dd className="mt-0.5 tabular-nums text-foreground">
                      {formatBr(row.limitDate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Em aberto</dt>
                    <dd className="mt-0.5 tabular-nums text-foreground">
                      {row.openInstallments}× = {formatCents(row.totalOpenCents)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Último pagamento</dt>
                    <dd className="mt-0.5 tabular-nums text-foreground">
                      {row.lastPaidAt ? formatBr(row.lastPaidAt.slice(0, 10)) : '--'}
                    </dd>
                  </div>
                </dl>
              ) : null}

              <div className="mt-4 flex flex-wrap items-end gap-3">
                {row.hasPlan ? (
                  <ActionForm action={registerPaymentAction} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="studentId" value={row.id} />

                    <div>
                      <label htmlFor={`method-${row.id}`} className="block text-xs text-muted">
                        Forma
                      </label>
                      <select
                        id={`method-${row.id}`}
                        name="method"
                        defaultValue="pix"
                        className={cn(inputClass, 'mt-1 w-32')}
                      >
                        {PAYMENT_METHODS.map((method) => (
                          <option key={method} value={method}>
                            {PAYMENT_METHOD_LABELS[method]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor={`amount-${row.id}`} className="block text-xs text-muted">
                        Valor
                      </label>
                      <input
                        id={`amount-${row.id}`}
                        name="amount"
                        type="text"
                        inputMode="decimal"
                        defaultValue={(row.amountCents / 100).toFixed(2).replace('.', ',')}
                        className={cn(inputClass, 'mt-1 w-28')}
                      />
                    </div>

                    <SubmitButton pendingLabel="Registrando…">Marcar como pago</SubmitButton>
                  </ActionForm>
                ) : null}

                <button
                  type="button"
                  onClick={() => setEditing(editing === row.id ? null : row.id)}
                  className="btn-ghost text-xs"
                >
                  {editing === row.id ? 'Fechar' : row.hasPlan ? 'Editar mensalidade' : 'Definir mensalidade'}
                </button>

                {row.hasPlan && row.lastPaidAt ? (
                  <ActionForm
                    action={undoPaymentAction}
                    confirm={`Desfazer o último pagamento de ${row.name}?`}
                  >
                    <input type="hidden" name="studentId" value={row.id} />
                    <SubmitButton className="btn-ghost text-xs" pendingLabel="…">
                      Desfazer último
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </div>

              {editing === row.id ? (
                <ActionForm
                  action={updatePlanAction}
                  className="mt-4 rounded-xl border border-hairline bg-white/[.03] p-4"
                >
                  <input type="hidden" name="studentId" value={row.id} />

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div>
                      <label htmlFor={`plan-${row.id}`} className="block text-xs text-muted">
                        Tipo
                      </label>
                      <select
                        id={`plan-${row.id}`}
                        name="planId"
                        defaultValue={row.planId}
                        className={cn(inputClass, 'mt-1')}
                      >
                        <option value="mensal">Mensal</option>
                        <option value="trimestral">Trimestral</option>
                        <option value="anual">Anual</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`newAmount-${row.id}`} className="block text-xs text-muted">
                        Valor (R$)
                      </label>
                      <input
                        id={`newAmount-${row.id}`}
                        name="amount"
                        type="text"
                        inputMode="decimal"
                        defaultValue={(row.amountCents / 100).toFixed(2).replace('.', ',')}
                        className={cn(inputClass, 'mt-1')}
                      />
                    </div>
                    <div>
                      <label htmlFor={`dueDay-${row.id}`} className="block text-xs text-muted">
                        Vence dia
                      </label>
                      <input
                        id={`dueDay-${row.id}`}
                        name="dueDay"
                        type="number"
                        min={1}
                        max={31}
                        defaultValue={row.dueDay}
                        className={cn(inputClass, 'mt-1')}
                      />
                    </div>
                    <div>
                      <label htmlFor={`grace-${row.id}`} className="block text-xs text-muted">
                        Tolerância
                      </label>
                      <input
                        id={`grace-${row.id}`}
                        name="graceDays"
                        type="number"
                        min={0}
                        max={28}
                        defaultValue={row.graceDays}
                        className={cn(inputClass, 'mt-1')}
                      />
                    </div>
                    <div>
                      <label htmlFor={`dueDate-${row.id}`} className="block text-xs text-muted">
                        Próximo vencimento
                      </label>
                      <input
                        id={`dueDate-${row.id}`}
                        name="dueDate"
                        type="date"
                        defaultValue={row.dueDate}
                        className={cn(inputClass, 'mt-1')}
                      />
                    </div>
                  </div>

                  <SubmitButton className="btn-secondary mt-4">Salvar mensalidade</SubmitButton>
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
