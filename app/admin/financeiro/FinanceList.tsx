'use client';

import { useMemo, useState } from 'react';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { cn } from '@/lib/utils';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from '@/types/domain';
import { formatBr } from '@/utils/datetime';
import { buildBillingMessage, buildReceipt, whatsappLinkTo } from '@/utils/billingMessage';
import { formatCents, PLAN_LABELS, type PaymentStatus, type PlanId } from '@/utils/paymentEngine';

import { registerPaymentAction, saveSettingsAction, undoPaymentAction, updatePlanAction } from '../actions';

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
  /** Telefone do aluno; nas crianças, o do responsável. */
  readonly phone: string;
  readonly unitLabel: string;
  readonly lastMethod: string;
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

/** Link de cobrança de uma linha. Sem telefone utilizável, `null`. */
function cobrancaDe(
  row: FinanceRow,
  pixKey: string,
  pixOwner: string,
  academyName: string,
): string | null {
  const chave = pixOwner.trim().length > 0 ? `${pixKey} (${pixOwner})` : pixKey;

  return whatsappLinkTo(
    row.phone,
    buildBillingMessage({
      name: row.name,
      amountCents: row.amountCents,
      dueDate: row.dueDate,
      limitDate: row.limitDate,
      openInstallments: row.openInstallments,
      totalOpenCents: row.totalOpenCents,
      overdue: row.status === 'vencida',
      pixKey: chave,
      academyName,
    }),
  );
}

export function FinanceList({
  rows,
  pixKey,
  pixOwner,
  academyName,
}: {
  readonly rows: readonly FinanceRow[];
  readonly pixKey: string;
  readonly pixOwner: string;
  readonly academyName: string;
}) {
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

      {/*
        A chave Pix entra na mensagem de cobrança. Fica aqui, e não numa
        variável de ambiente, para o professor poder trocá-la sozinho — sem
        acesso ao painel da hospedagem e sem novo deploy.
      */}
      <details className="surface-card mt-4 overflow-hidden">
        <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium">
          <span>
            Dados de cobrança
            {pixKey.trim().length === 0 ? (
              <span className="ml-2 text-xs font-normal text-amber-300">
                chave Pix não definida
              </span>
            ) : (
              <span className="ml-2 text-xs font-normal text-muted">Pix: {pixKey}</span>
            )}
          </span>
          <span aria-hidden="true" className="text-muted">
            ▾
          </span>
        </summary>

        <ActionForm action={saveSettingsAction} className="border-t border-hairline p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="pixKey" className="block text-xs text-muted">
                Chave Pix
              </label>
              <input
                id="pixKey"
                name="pixKey"
                type="text"
                defaultValue={pixKey}
                placeholder="CPF, telefone, e-mail ou chave aleatória"
                className={cn(inputClass, 'mt-1')}
              />
            </div>
            <div>
              <label htmlFor="pixOwner" className="block text-xs text-muted">
                Titular da chave
              </label>
              <input
                id="pixOwner"
                name="pixOwner"
                type="text"
                defaultValue={pixOwner}
                placeholder="Nome que aparece para o aluno confirmar"
                className={cn(inputClass, 'mt-1')}
              />
            </div>
          </div>

          <SubmitButton className="btn-secondary mt-4">Salvar</SubmitButton>
        </ActionForm>
      </details>

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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm text-muted">
          {visible.length} {visible.length === 1 ? 'aluno' : 'alunos'}
        </p>

        <CobrancaEmLote
          rows={visible}
          pixKey={pixKey}
          pixOwner={pixOwner}
          academyName={academyName}
        />
      </div>

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

                {row.hasPlan ? (
                  <BillingButton
                    row={row}
                    pixKey={pixKey}
                    pixOwner={pixOwner}
                    academyName={academyName}
                  />
                ) : null}

                {row.hasPlan ? <ReceiptButton row={row} academyName={academyName} /> : null}

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

/**
 * Abre o WhatsApp do aluno com a cobrança já escrita.
 *
 * O texto é montado no cliente, a partir dos mesmos dados que a linha já
 * mostra — não há chamada ao servidor nem nada gravado. Sem telefone válido
 * o botão fica desabilitado e diz o porquê: abrir conversa com o número
 * errado é pior do que não abrir nenhuma.
 */
function BillingButton({
  row,
  pixKey,
  pixOwner,
  academyName,
}: {
  readonly row: FinanceRow;
  readonly pixKey: string;
  readonly pixOwner: string;
  readonly academyName: string;
}) {
  const link = cobrancaDe(row, pixKey, pixOwner, academyName);

  if (!link) {
    return (
      <span className="text-xs text-muted" title="Cadastro sem telefone utilizável">
        Sem telefone para cobrar
      </span>
    );
  }

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/[.08] px-3.5 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/[.14]"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="currentColor">
        <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.39a9.86 9.86 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.44 9.9-9.9 0-2.64-1.03-5.13-2.9-7A9.82 9.82 0 0 0 12.04 2m0 1.67c2.2 0 4.27.86 5.82 2.42a8.19 8.19 0 0 1 2.42 5.82c0 4.54-3.7 8.23-8.24 8.23a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.05-.2-.31a8.18 8.18 0 0 1-1.26-4.37c0-4.54 3.7-8.23 8.24-8.23M8.53 7.33c-.16 0-.43.06-.65.3-.22.24-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.72 2.76 4.25 3.76 2.1.83 2.53.67 2.99.63.46-.04 1.48-.6 1.69-1.19.21-.59.21-1.09.14-1.19-.06-.1-.22-.16-.46-.28-.24-.12-1.45-.72-1.67-.8-.22-.08-.39-.12-.55.12-.16.25-.63.8-.77.96-.14.17-.28.19-.52.07-.24-.12-1.03-.38-1.96-1.21-.72-.65-1.21-1.45-1.35-1.69-.14-.24-.02-.37.1-.49.11-.11.24-.28.37-.42.12-.14.16-.24.24-.4.08-.17.04-.31-.02-.43-.06-.12-.54-1.34-.75-1.83-.2-.48-.4-.42-.55-.42z" />
      </svg>
      Cobrar no WhatsApp
    </a>
  );
}

/**
 * Cobra todos os alunos da lista visível, um de cada vez.
 *
 * Não abre as conversas em sequência automática: o navegador bloqueia várias
 * abas abertas de uma vez, e mesmo que não bloqueasse, o professor precisa
 * conferir cada mensagem antes de mandar. O botão avança um por vez e mostra
 * onde parou — dá para interromper no meio e retomar depois.
 */
function CobrancaEmLote({
  rows,
  pixKey,
  pixOwner,
  academyName,
}: {
  readonly rows: readonly FinanceRow[];
  readonly pixKey: string;
  readonly pixOwner: string;
  readonly academyName: string;
}) {
  const [indice, setIndice] = useState(0);

  const fila = useMemo(
    () =>
      rows
        .filter((row) => row.hasPlan && row.status !== 'em_dia')
        .map((row) => ({ row, link: cobrancaDe(row, pixKey, pixOwner, academyName) }))
        .filter((item): item is { row: FinanceRow; link: string } => item.link !== null),
    [rows, pixKey, pixOwner, academyName],
  );

  // A fila muda quando o filtro muda; recomeçar evita apontar para outro aluno.
  const atual = fila[indice];
  const semTelefone = rows.filter(
    (row) => row.hasPlan && row.status !== 'em_dia' && !cobrancaDe(row, pixKey, pixOwner, academyName),
  ).length;

  if (fila.length === 0) {
    return semTelefone > 0 ? (
      <p className="text-xs text-muted">
        {semTelefone} {semTelefone === 1 ? 'aluno sem telefone' : 'alunos sem telefone'} para cobrar
      </p>
    ) : null;
  }

  if (!atual) {
    return (
      <div className="flex items-center gap-3">
        <p className="text-xs text-emerald-300">
          Fila concluída — {fila.length} {fila.length === 1 ? 'cobrança' : 'cobranças'}.
        </p>
        <button type="button" onClick={() => setIndice(0)} className="btn-ghost text-xs">
          Recomeçar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <a
        href={atual.link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setIndice((n) => n + 1)}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-500/90 px-4 text-sm font-semibold text-ink transition-colors hover:bg-emerald-400"
      >
        Cobrar em lote ({indice + 1}/{fila.length})
      </a>

      <span className="text-xs text-muted">
        próximo: {atual.row.name}
        {indice > 0 ? ` · ${indice} ${indice === 1 ? 'enviada' : 'enviadas'}` : ''}
        {semTelefone > 0 ? ` · ${semTelefone} sem telefone` : ''}
      </span>

      {indice > 0 ? (
        <button type="button" onClick={() => setIndice(0)} className="btn-ghost text-xs">
          Reiniciar fila
        </button>
      ) : null}
    </div>
  );
}

/** Manda o recibo do último pagamento pelo WhatsApp do aluno. */
function ReceiptButton({
  row,
  academyName,
}: {
  readonly row: FinanceRow;
  readonly academyName: string;
}) {
  if (!row.lastPaidAt) return null;

  const link = whatsappLinkTo(
    row.phone,
    buildReceipt({
      name: row.name,
      amountCents: row.amountCents,
      paidAt: row.lastPaidAt,
      // O vencimento atual já avançou com a baixa: o recibo é do anterior.
      dueDate: row.dueDate,
      method: row.lastMethod,
      academyName,
      unitLabel: row.unitLabel,
    }),
  );

  if (!link) return null;

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-ghost text-xs"
    >
      Mandar recibo
    </a>
  );
}
