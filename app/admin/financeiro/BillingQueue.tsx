'use client';

import { useState, useTransition } from 'react';

import { cn } from '@/lib/utils';
import { formatBr } from '@/utils/datetime';
import { formatCents } from '@/utils/paymentEngine';

import { markFollowupAction } from '../actions';

/** Um inadimplente, já com a conversa montada no servidor. */
export interface BillingTarget {
  readonly id: string;
  readonly name: string;
  readonly amountCents: number;
  readonly totalOpenCents: number;
  readonly openInstallments: number;
  /** `YYYY-MM-DD` do vencimento em aberto. */
  readonly dueDate: string;
  readonly daysLate: number;
  readonly unitLabel: string;
  /** `null` quando não há telefone utilizável na ficha. */
  readonly whatsappUrl: string | null;
  /** `true` quando já foi cobrado neste mês. */
  readonly charged: boolean;
}

/**
 * Fila de cobrança: um inadimplente por vez.
 *
 * A lista de vencidos já existia, e cobrar nela era garimpo: rolar a tela,
 * encontrar quem está em aberto, abrir o WhatsApp de um, voltar, lembrar em
 * quem parou. Com dez vencidos o professor desistia no quinto.
 *
 * Aqui a tela mostra **um** aluno, com o texto pronto. Abrir a conversa marca
 * como cobrado e já traz o próximo — um clique por aluno. O que foi cobrado
 * fica registrado pelo mês de referência, então reabrir a fila amanhã não
 * oferece de novo quem já recebeu a mensagem hoje.
 *
 * A ordem nunca muda enquanto a tela está aberta: marcar alguém não reordena
 * a fila, senão o "próximo" pularia nomes sem avisar.
 */
export function BillingQueue({ targets }: { readonly targets: readonly BillingTarget[] }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [marked, setMarked] = useState<ReadonlySet<string>>(new Set());
  const [, startTransition] = useTransition();

  const pendentes = targets.filter((item) => !item.charged && !marked.has(item.id));
  const atual = targets[index] ?? null;

  if (targets.length === 0) return null;

  const jaCobrado = (target: BillingTarget): boolean =>
    target.charged || marked.has(target.id);

  const avancar = (): void => {
    setIndex((atualIndex) => Math.min(atualIndex + 1, targets.length - 1));
  };

  const marcar = (target: BillingTarget, undo = false): void => {
    // Otimista: o professor acabou de clicar e já quer ver a fila andar. A
    // action só confirma — e se falhar, o retorno da tela desfaz na próxima
    // leitura, porque a verdade está no banco.
    setMarked((set) => {
      const next = new Set(set);
      if (undo) next.delete(target.id);
      else next.add(target.id);
      return next;
    });

    const form = new FormData();
    form.set('kind', 'cobranca');
    form.set('userId', target.id);
    if (undo) form.set('undo', 'on');

    startTransition(async () => {
      await markFollowupAction(form);
    });
  };

  return (
    <section className={cn('panel panel-pad', pendentes.length > 0 && 'border-crimson/35')}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="panel-title">Fila de cobrança</p>
          <p className="mt-1.5 text-sm text-foreground">
            {pendentes.length === 0 ? (
              <span className="text-emerald-300">
                Todos os {targets.length} vencidos já foram cobrados neste mês.
              </span>
            ) : (
              <>
                <span className="font-display text-xl tabular-nums text-crimson">
                  {pendentes.length}
                </span>
                <span className="text-muted">
                  {' '}
                  {pendentes.length === 1 ? 'aluno para cobrar' : 'alunos para cobrar'} de{' '}
                  {targets.length} vencidos
                </span>
              </>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            // Abre já no primeiro que falta cobrar, e não no começo da lista.
            if (!open) {
              const primeiro = targets.findIndex((item) => !jaCobrado(item));
              setIndex(primeiro >= 0 ? primeiro : 0);
            }
            setOpen((aberto) => !aberto);
          }}
          className={pendentes.length > 0 ? 'btn-primary' : 'btn-secondary'}
        >
          {open ? 'Fechar fila' : 'Abrir a fila'}
        </button>
      </div>

      {open && atual ? (
        <div className="mt-4 border-t border-hairline pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="font-display text-xl uppercase tracking-tight">{atual.name}</p>
            <p className="text-xs tabular-nums text-muted">
              {index + 1} de {targets.length}
            </p>
          </div>

          <p className="mt-1 text-sm text-muted">
            {atual.openInstallments > 1
              ? `${atual.openInstallments} mensalidades em aberto · ${formatCents(atual.totalOpenCents)}`
              : formatCents(atual.amountCents)}
            {' · venceu '}
            {formatBr(atual.dueDate)}
            {atual.daysLate > 0
              ? ` (${atual.daysLate} ${atual.daysLate === 1 ? 'dia' : 'dias'})`
              : ''}
            {` · ${atual.unitLabel}`}
          </p>

          {jaCobrado(atual) ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="badge-ok">Cobrado neste mês</span>
              <button
                type="button"
                onClick={() => marcar(atual, true)}
                className="btn-ghost px-1 text-[11px]"
              >
                desmarcar
              </button>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {atual.whatsappUrl ? (
              <a
                href={atual.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  marcar(atual);
                  avancar();
                }}
                className="btn-primary"
              >
                Cobrar no WhatsApp
              </a>
            ) : (
              <span className="badge-warn">Sem telefone utilizável na ficha</span>
            )}

            {!jaCobrado(atual) ? (
              <button
                type="button"
                onClick={() => {
                  marcar(atual);
                  avancar();
                }}
                className="btn-secondary"
              >
                Já cobrei
              </button>
            ) : null}

            <button
              type="button"
              onClick={avancar}
              disabled={index >= targets.length - 1}
              className="btn-ghost disabled:opacity-40"
            >
              Pular
            </button>

            <button
              type="button"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="btn-ghost disabled:opacity-40"
            >
              Voltar
            </button>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-muted">
            Abrir a conversa já marca como cobrado e passa para o próximo. A marca vale pelo mês:
            no mês que vem a fila recomeça.
          </p>
        </div>
      ) : null}
    </section>
  );
}
