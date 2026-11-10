'use client';

import { useState } from 'react';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { cn } from '@/lib/utils';
import { UNITS, UNIT_LABELS, UNIT_SHORT, type UnitId } from '@/types/domain';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  INCOME_CATEGORIES,
  INCOME_CATEGORY_LABELS,
  type CashKind,
} from '@/utils/cashbook';
import { formatBr } from '@/utils/datetime';
import { formatCents } from '@/utils/paymentEngine';

import {
  deleteCashEntryAction,
  deleteRecurringCostAction,
  saveCashEntryAction,
  saveRecurringCostAction,
} from '../actions';

const inputClass =
  'w-full min-h-[44px] rounded-xl border border-hairline bg-white/[.04] px-3 py-2 text-sm text-foreground focus:border-crimson focus:outline-none';

export interface CashRow {
  readonly id: string;
  readonly kind: CashKind;
  readonly date: string;
  readonly amountCents: number;
  readonly category: string;
  readonly categoryLabel: string;
  readonly description: string;
  readonly unit: UnitId | 'rede';
}

export interface RecurringRow {
  readonly id: string;
  readonly kind: CashKind;
  readonly amountCents: number;
  readonly category: string;
  readonly categoryLabel: string;
  readonly description: string;
  readonly unit: UnitId | 'rede';
  readonly dueDay: number;
}

function unitLabel(unit: UnitId | 'rede'): string {
  return unit === 'rede' ? 'Rede' : UNIT_SHORT[unit];
}

/**
 * Lançamentos do mês e contas fixas.
 *
 * Um formulário só para entrada e saída, alternando pelo tipo: as duas têm os
 * mesmos campos, e duas telas quase iguais seriam dois lugares para esquecer
 * uma regra. O que muda é a lista de categorias e a cor.
 */
export function CashbookScreen({
  month,
  today,
  entries,
  recurring,
  closed,
}: {
  /** `YYYY-MM` em exibição. */
  readonly month: string;
  /** Hoje em São Paulo: teto da data do lançamento. */
  readonly today: string;
  readonly entries: readonly CashRow[];
  readonly recurring: readonly RecurringRow[];
  readonly closed: boolean;
}) {
  const [kind, setKind] = useState<CashKind>('despesa');
  const [open, setOpen] = useState(false);
  const [fixas, setFixas] = useState(false);

  const categorias = kind === 'despesa' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const rotulos: Readonly<Record<string, string>> =
    kind === 'despesa' ? EXPENSE_CATEGORY_LABELS : INCOME_CATEGORY_LABELS;

  // Data sugerida: hoje, se hoje estiver no mês aberto; senão o dia 1 dele.
  // Lançar em março olhando março não deveria exigir corrigir a data.
  const dataPadrao = today.startsWith(month) ? today : `${month}-01`;

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg uppercase tracking-tight">Lançamentos do mês</h2>

        {closed ? (
          <span className="badge-neutral">Mês fechado — reabra para lançar</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setKind('despesa');
                setOpen((aberto) => !aberto || kind !== 'despesa');
              }}
              className="btn-primary"
            >
              {open && kind === 'despesa' ? 'Fechar' : 'Lançar saída'}
            </button>
            <button
              type="button"
              onClick={() => {
                setKind('receita');
                setOpen((aberto) => !aberto || kind !== 'receita');
              }}
              className="btn-secondary"
            >
              {open && kind === 'receita' ? 'Fechar' : 'Lançar entrada'}
            </button>
          </div>
        )}
      </div>

      {open && !closed ? (
        <ActionForm
          action={saveCashEntryAction}
          className={cn('panel panel-pad', kind === 'despesa' ? 'border-crimson/30' : 'border-emerald-500/25')}
          onDone={(result) => {
            if (result.ok) setOpen(false);
          }}
        >
          <input type="hidden" name="kind" value={kind} />

          <p className="panel-title">
            {kind === 'despesa' ? 'Nova saída' : 'Nova entrada (não é mensalidade)'}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="cash-date" className="block text-xs text-muted">
                Data
              </label>
              <input
                id="cash-date"
                name="date"
                type="date"
                required
                max={today}
                defaultValue={dataPadrao}
                className={cn(inputClass, 'mt-1')}
              />
            </div>

            <div>
              <label htmlFor="cash-amount" className="block text-xs text-muted">
                Valor
              </label>
              <input
                id="cash-amount"
                name="amount"
                type="text"
                inputMode="decimal"
                required
                placeholder="250,00"
                className={cn(inputClass, 'mt-1')}
              />
            </div>

            <div>
              <label htmlFor="cash-category" className="block text-xs text-muted">
                Categoria
              </label>
              <select
                id="cash-category"
                name="category"
                // `key` no tipo: trocar entre saída e entrada precisa redesenhar
                // o select, senão a categoria da lista antiga fica selecionada
                // e o servidor recusa o lançamento.
                key={`cat-${kind}`}
                className={cn(inputClass, 'mt-1')}
              >
                {categorias.map((item) => (
                  <option key={item} value={item}>
                    {rotulos[item] ?? item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="cash-unit" className="block text-xs text-muted">
                Academia
              </label>
              <select id="cash-unit" name="unit" defaultValue="rede" className={cn(inputClass, 'mt-1')}>
                <option value="rede">Rede (as duas)</option>
                {UNITS.map((item) => (
                  <option key={item} value={item}>
                    {UNIT_LABELS[item]}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <label htmlFor="cash-description" className="block text-xs text-muted">
                Descrição
              </label>
              <input
                id="cash-description"
                name="description"
                type="text"
                required
                maxLength={120}
                placeholder={kind === 'despesa' ? 'Aluguel de março' : 'Kimono vendido ao Pedro'}
                className={cn(inputClass, 'mt-1')}
              />
            </div>
          </div>

          <div className="mt-4">
            <SubmitButton>Lançar</SubmitButton>
          </div>
        </ActionForm>
      ) : null}

      {/* Lista do mês ------------------------------------------------------ */}
      {entries.length === 0 ? (
        <div className="panel px-6 py-12 text-center">
          <p className="font-display text-lg uppercase tracking-tight">Mês sem lançamento</p>
          <p className="mt-2 text-sm text-muted">
            As mensalidades entram sozinhas, pelo registro de pagamento. Aqui vão aluguel,
            energia, professor, kimono vendido — tudo o que não é mensalidade.
          </p>
        </div>
      ) : (
        <ul className="panel divide-y divide-hairline">
          {entries.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
              <span className="w-14 shrink-0 text-xs tabular-nums text-muted">
                {formatBr(row.date).slice(0, 5)}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{row.description}</span>
                <span className="block truncate text-xs text-muted">
                  {row.categoryLabel} · {unitLabel(row.unit)}
                </span>
              </span>

              <span
                className={cn(
                  'shrink-0 font-display tabular-nums',
                  row.kind === 'despesa' ? 'text-accent' : 'text-emerald-300',
                )}
              >
                {row.kind === 'despesa' ? '−' : '+'}
                {formatCents(row.amountCents)}
              </span>

              {!closed ? (
                <ActionForm
                  action={deleteCashEntryAction}
                  confirm={`Remover "${row.description}" de ${formatBr(row.date)}?`}
                >
                  <input type="hidden" name="month" value={month} />
                  <input type="hidden" name="id" value={row.id} />
                  <SubmitButton className="btn-ghost px-1 text-[11px] text-accent" pendingLabel="…">
                    remover
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* Contas fixas ------------------------------------------------------ */}
      <section className="border-t border-hairline pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg uppercase tracking-tight">Contas fixas</h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              O que se repete todo mês. Não são lançamentos: ficam guardadas como modelo e você
              lança o mês com um clique, no botão acima da página. Lançar duas vezes não duplica.
            </p>
          </div>

          <button type="button" onClick={() => setFixas((aberto) => !aberto)} className="btn-secondary">
            {fixas ? 'Fechar' : 'Nova conta fixa'}
          </button>
        </div>

        {fixas ? (
          <ActionForm
            action={saveRecurringCostAction}
            className="panel panel-pad mt-4"
            onDone={(result) => {
              if (result.ok) setFixas(false);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <label htmlFor="fx-kind" className="block text-xs text-muted">
                  Tipo
                </label>
                <select id="fx-kind" name="kind" defaultValue="despesa" className={cn(inputClass, 'mt-1')}>
                  <option value="despesa">Saída</option>
                  <option value="receita">Entrada</option>
                </select>
              </div>

              <div>
                <label htmlFor="fx-amount" className="block text-xs text-muted">
                  Valor
                </label>
                <input
                  id="fx-amount"
                  name="amount"
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="2000,00"
                  className={cn(inputClass, 'mt-1')}
                />
              </div>

              <div>
                <label htmlFor="fx-category" className="block text-xs text-muted">
                  Categoria
                </label>
                <select id="fx-category" name="category" className={cn(inputClass, 'mt-1')}>
                  {EXPENSE_CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {EXPENSE_CATEGORY_LABELS[item]}
                    </option>
                  ))}
                  {INCOME_CATEGORIES.map((item) => (
                    <option key={`r-${item}`} value={item}>
                      {INCOME_CATEGORY_LABELS[item]} (entrada)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="fx-dueDay" className="block text-xs text-muted">
                  Cai no dia
                </label>
                <input
                  id="fx-dueDay"
                  name="dueDay"
                  type="number"
                  min={1}
                  max={31}
                  defaultValue={10}
                  className={cn(inputClass, 'mt-1')}
                />
              </div>

              <div>
                <label htmlFor="fx-unit" className="block text-xs text-muted">
                  Academia
                </label>
                <select id="fx-unit" name="unit" defaultValue="rede" className={cn(inputClass, 'mt-1')}>
                  <option value="rede">Rede</option>
                  {UNITS.map((item) => (
                    <option key={item} value={item}>
                      {UNIT_LABELS[item]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2 lg:col-span-5">
                <label htmlFor="fx-description" className="block text-xs text-muted">
                  Descrição
                </label>
                <input
                  id="fx-description"
                  name="description"
                  type="text"
                  required
                  maxLength={120}
                  placeholder="Aluguel do tatame"
                  className={cn(inputClass, 'mt-1')}
                />
              </div>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-muted">
              A descrição é o que identifica a conta no mês: lançar o mês duas vezes não repete
              uma conta que já esteja lá com a mesma descrição e categoria.
            </p>

            <div className="mt-4">
              <SubmitButton>Salvar conta fixa</SubmitButton>
            </div>
          </ActionForm>
        ) : null}

        {recurring.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            Nenhuma conta fixa cadastrada. Com elas, a previsão dos próximos meses passa a
            descontar o custo, e não só somar a receita.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recurring.map((row) => (
              <li key={row.id} className="panel p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span
                    className={cn(
                      'font-display tabular-nums',
                      row.kind === 'despesa' ? 'text-accent' : 'text-emerald-300',
                    )}
                  >
                    {row.kind === 'despesa' ? '−' : '+'}
                    {formatCents(row.amountCents)}
                  </span>
                  <span className="text-xs text-muted">dia {row.dueDay}</span>
                </div>

                <p className="mt-1 truncate text-sm text-foreground">{row.description}</p>
                <p className="truncate text-xs text-muted">
                  {row.categoryLabel} · {unitLabel(row.unit)}
                </p>

                <ActionForm
                  action={deleteRecurringCostAction}
                  className="mt-3"
                  confirm={`Remover a conta fixa "${row.description}"? Os lançamentos já feitos continuam.`}
                >
                  <input type="hidden" name="id" value={row.id} />
                  <SubmitButton className="btn-ghost text-xs text-accent" pendingLabel="…">
                    Remover
                  </SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
