'use client';

import { useMemo, useState } from 'react';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { cn, pluralize } from '@/lib/utils';
import {
  RAISE_MAX_PERCENT,
  RAISE_MIN_PERCENT,
  formatCents,
  parsePercentInput,
  raisedCents,
  type PlanId,
} from '@/utils/paymentEngine';
import { normalizeSearch } from '@/utils/searchText';

import { bulkRaiseAction } from '../actions';

export interface RaiseRow {
  readonly id: string;
  readonly name: string;
  readonly category: 'kids' | 'adulto';
  readonly planId: PlanId;
  /** `Mensal`, `Trimestral`, `Anual`. */
  readonly planLabel: string;
  /** Nome do plano da vitrine, quando o aluno contratou um. */
  readonly planName: string;
  readonly unitShort: string;
  /** Valor de tabela — é sobre ele que o percentual incide. */
  readonly amountCents: number;
  readonly discountCents: number;
  /** O que o aluno paga hoje: tabela menos desconto. */
  readonly netCents: number;
  readonly dueDateLabel: string;
  readonly haystack: string;
}

type Recorte = 'todos' | 'mensal' | 'trimestral' | 'anual' | 'desconto';

const RECORTES: readonly { id: Recorte; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'mensal', label: 'Mensais' },
  { id: 'trimestral', label: 'Trimestrais' },
  { id: 'anual', label: 'Anuais' },
  { id: 'desconto', label: 'Com desconto' },
];

const ATALHOS: readonly number[] = [5, 8, 10, 15];

const inputClass =
  'min-h-[44px] w-full rounded-xl border border-hairline bg-white/[.04] px-3 py-2 text-sm text-foreground placeholder:text-muted/70 focus:border-crimson focus:outline-none';

/**
 * Reajuste em lote, com a conta na tela antes de gravar.
 *
 * A prévia não é enfeite: é o que separa "aplicar 8%" de "aplicar 8% e
 * descobrir no mês seguinte que o aluno com bolsa passou a pagar cheio". Cada
 * linha mostra o valor de hoje, o de depois e a diferença, e o rodapé soma o
 * impacto no mês — tudo pela mesma função que o servidor usa
 * (`raisedCents`), para a prévia não divergir da gravação.
 *
 * O desconto fica intocado: o percentual incide sobre o valor de tabela, e
 * quem tem bolsa continua com a mesma bolsa em reais.
 */
export function BulkRaise({ rows }: { readonly rows: readonly RaiseRow[] }) {
  const [percentInput, setPercentInput] = useState('');
  const [recorte, setRecorte] = useState<Recorte>('todos');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const percent = parsePercentInput(percentInput);

  const visible = useMemo(() => {
    const termo = normalizeSearch(search);

    return rows.filter((row) => {
      if (termo.length > 0 && !row.haystack.includes(termo)) return false;
      if (recorte === 'desconto') return row.discountCents > 0;
      if (recorte !== 'todos') return row.planId === recorte;
      return true;
    });
  }, [rows, recorte, search]);

  const marcados = useMemo(() => rows.filter((row) => selected.has(row.id)), [rows, selected]);

  const todosVisiveisMarcados =
    visible.length > 0 && visible.every((row) => selected.has(row.id));

  const alternarTodos = (): void => {
    setSelected((atual) => {
      const next = new Set(atual);
      if (todosVisiveisMarcados) {
        for (const row of visible) next.delete(row.id);
      } else {
        for (const row of visible) next.add(row.id);
      }
      return next;
    });
  };

  const alternar = (id: string): void => {
    setSelected((atual) => {
      const next = new Set(atual);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Novo valor de tabela e novo líquido de uma linha, para o percentual atual. */
  const simular = (row: RaiseRow): { tabela: number; liquido: number } => {
    if (percent === null) return { tabela: row.amountCents, liquido: row.netCents };
    const tabela = raisedCents(row.amountCents, percent);
    return { tabela, liquido: Math.max(0, tabela - row.discountCents) };
  };

  // Impacto no mês: só os planos mensais, que são os que vencem todo mês.
  const mensaisMarcados = marcados.filter((row) => row.planId === 'mensal');
  const antes = mensaisMarcados.reduce((soma, row) => soma + row.netCents, 0);
  const depois = mensaisMarcados.reduce((soma, row) => soma + simular(row).liquido, 0);
  const diferenca = depois - antes;

  const podeAplicar = percent !== null && marcados.length > 0;

  return (
    <div className="space-y-3">
      {/* Percentual ------------------------------------------------------- */}
      <section className="panel panel-pad">
        <h2 className="panel-title">Quanto reajustar</h2>

        <div className="mt-3.5 flex flex-wrap items-end gap-4">
          <div className="w-32">
            <label htmlFor="percent" className="block text-xs text-muted">
              Percentual
            </label>
            <div className="relative mt-1">
              <input
                id="percent"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={percentInput}
                onChange={(event) => setPercentInput(event.target.value)}
                placeholder="8"
                aria-describedby="percent-faixa"
                className={cn(inputClass, 'pr-8 text-right font-display text-base tabular-nums')}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted"
              >
                %
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {ATALHOS.map((valor) => (
              <button
                key={valor}
                type="button"
                onClick={() => setPercentInput(String(valor))}
                aria-pressed={percentInput === String(valor)}
                className={cn(
                  'inline-flex min-h-[44px] items-center rounded-xl border px-3.5 text-sm font-medium tabular-nums transition-colors',
                  percentInput === String(valor)
                    ? 'border-crimson bg-crimson text-foreground'
                    : 'border-hairline bg-white/[.04] text-muted hover:text-foreground',
                )}
              >
                +{valor}%
              </button>
            ))}
          </div>
        </div>

        <p id="percent-faixa" className="mt-3 text-xs leading-relaxed text-muted">
          Incide sobre o valor de tabela, de {RAISE_MIN_PERCENT}% a +{RAISE_MAX_PERCENT}%.
          Negativo reduz. O desconto de quem tem bolsa fica igual, em reais, e o vencimento
          não se move.
        </p>

        {percentInput.trim().length > 0 && percent === null ? (
          <p role="status" className="notice-warn mt-3 text-xs">
            Use um número entre {RAISE_MIN_PERCENT} e {RAISE_MAX_PERCENT}, diferente de zero.
            Vírgula vale: <strong className="text-foreground">7,5</strong>.
          </p>
        ) : null}
      </section>

      {/* Quem entra ------------------------------------------------------- */}
      <section className="panel panel-pad">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="panel-title">Quem entra no reajuste</h2>
          <p aria-live="polite" className="text-xs tabular-nums text-muted">
            {marcados.length} de {rows.length} {pluralize(rows.length, 'aluno', 'alunos')}
          </p>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div role="group" aria-label="Filtrar por plano" className="flex flex-wrap gap-2">
            {RECORTES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setRecorte(item.id)}
                aria-pressed={recorte === item.id}
                className={cn(
                  'inline-flex min-h-[44px] items-center rounded-xl border px-3.5 text-sm font-medium transition-colors',
                  recorte === item.id
                    ? 'border-crimson bg-crimson text-foreground'
                    : 'border-hairline bg-white/[.04] text-muted hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="ml-auto">
            <span className="sr-only">Buscar aluno</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar aluno…"
              className={cn(inputClass, 'sm:w-64')}
            />
          </label>
        </div>

        <label className="mt-3.5 flex min-h-[44px] cursor-pointer items-center gap-3 border-t border-hairline pt-3 text-sm">
          <input
            type="checkbox"
            checked={todosVisiveisMarcados}
            onChange={alternarTodos}
            disabled={visible.length === 0}
            className="h-5 w-5 accent-crimson"
          />
          <span className="text-foreground">
            {todosVisiveisMarcados ? 'Desmarcar' : 'Marcar'} os {visible.length} visíveis
          </span>
        </label>

        {visible.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            Nenhum aluno neste recorte. Ajuste o filtro ou a busca.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-white/[.05]">
            {visible.map((row) => {
              const marcado = selected.has(row.id);
              const { liquido } = simular(row);
              const delta = liquido - row.netCents;
              const muda = marcado && percent !== null && delta !== 0;

              return (
                <li key={row.id}>
                  <label
                    className={cn(
                      'flex min-h-[56px] cursor-pointer items-center gap-3 px-1 py-2 -mx-1 transition-colors',
                      marcado ? 'bg-crimson/[.05]' : 'hover:bg-white/[.03]',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternar(row.id)}
                      className="h-5 w-5 shrink-0 accent-crimson"
                    />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{row.name}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {[
                          row.planName || row.planLabel,
                          row.planId === 'mensal' ? null : row.planLabel.toLowerCase(),
                          row.unitShort,
                          row.discountCents > 0
                            ? `desconto de ${formatCents(row.discountCents)}`
                            : null,
                          `vence ${row.dueDateLabel}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>

                    {/*
                      Antes e depois na mesma linha, com o valor de hoje
                      riscado. Só o número novo deixaria o professor conferindo
                      de memória qual era o anterior.
                    */}
                    <span className="shrink-0 text-right">
                      {muda ? (
                        <>
                          <span className="block text-[11px] tabular-nums text-muted line-through">
                            {formatCents(row.netCents)}
                          </span>
                          <span className="block text-sm font-medium tabular-nums text-foreground">
                            {formatCents(liquido)}
                          </span>
                          <span
                            className={cn(
                              'block text-[11px] tabular-nums',
                              delta > 0 ? 'text-emerald-300' : 'text-accent',
                            )}
                          >
                            {delta > 0 ? '+' : '−'}
                            {formatCents(Math.abs(delta))}
                          </span>
                        </>
                      ) : (
                        <span className="block text-sm tabular-nums text-muted">
                          {formatCents(row.netCents)}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Aplicar ---------------------------------------------------------- */}
      <ActionForm
        action={bulkRaiseAction}
        className="panel panel-pad"
        confirm={
          percent === null
            ? undefined
            : `Aplicar ${percent > 0 ? '+' : ''}${percent}% em ${marcados.length} ${pluralize(
                marcados.length,
                'mensalidade',
                'mensalidades',
              )}? Cada mudança entra no histórico do aluno, e desfazer é um por um.`
        }
        onDone={(result) => {
          // Reajuste aplicado: limpar a seleção evita o segundo clique que
          // aplicaria o mesmo percentual de novo em cima do valor já reajustado.
          if (result.ok) {
            setSelected(new Set());
            setPercentInput('');
          }
        }}
      >
        {marcados.map((row) => (
          <input key={row.id} type="hidden" name="studentIds" value={row.id} />
        ))}
        <input type="hidden" name="percent" value={percentInput} />

        <h2 className="panel-title">Conferir e aplicar</h2>

        <div className="mt-3.5 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted">Receita mensal de hoje</p>
            <p className="mt-1 font-display text-xl leading-none tabular-nums">
              {formatCents(antes)}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {mensaisMarcados.length} {pluralize(mensaisMarcados.length, 'plano', 'planos')}{' '}
              mensal
              {mensaisMarcados.length === 1 ? '' : 'is'} marcado
              {mensaisMarcados.length === 1 ? '' : 's'}
            </p>
          </div>

          <div>
            <p className="text-xs text-muted">Depois do reajuste</p>
            <p
              className={cn(
                'mt-1 font-display text-xl leading-none tabular-nums',
                diferenca !== 0 ? 'text-accent' : null,
              )}
            >
              {formatCents(depois)}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {diferenca === 0
                ? 'sem mudança'
                : `${diferenca > 0 ? '+' : '−'}${formatCents(Math.abs(diferenca))} por mês`}
            </p>
          </div>

          <div>
            <label htmlFor="changeNote" className="block text-xs text-muted">
              Motivo (vai no histórico)
            </label>
            <input
              id="changeNote"
              name="changeNote"
              type="text"
              maxLength={80}
              autoComplete="off"
              placeholder={percent === null ? 'reajuste anual' : `reajuste de ${percent}%`}
              className={cn(inputClass, 'mt-1')}
            />
          </div>
        </div>

        {/*
          Trimestral e anual entram no reajuste, mas não no total acima: o
          valor deles não vence todo mês e somá-los daria uma receita mensal
          que não existe. Dizer isso aqui evita a conclusão de que ficaram de
          fora da gravação.
        */}
        {marcados.length > mensaisMarcados.length ? (
          <p className="mt-3 text-xs leading-relaxed text-muted">
            {marcados.length - mensaisMarcados.length}{' '}
            {pluralize(marcados.length - mensaisMarcados.length, 'marcado', 'marcados')} em plano
            trimestral ou anual também {marcados.length - mensaisMarcados.length === 1 ? 'será' : 'serão'}{' '}
            reajustado{marcados.length - mensaisMarcados.length === 1 ? '' : 's'} — eles só não
            entram na soma mensal acima.
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
          <SubmitButton
            className={cn('btn-primary', !podeAplicar && 'pointer-events-none opacity-50')}
            pendingLabel="Reajustando…"
            disabled={!podeAplicar}
          >
            {percent === null
              ? 'Informe o percentual'
              : marcados.length === 0
                ? 'Marque quem entra'
                : `Aplicar em ${marcados.length} ${pluralize(marcados.length, 'aluno', 'alunos')}`}
          </SubmitButton>

          {marcados.length > 0 ? (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="btn-ghost text-sm"
            >
              Limpar seleção
            </button>
          ) : null}
        </div>
      </ActionForm>
    </div>
  );
}
