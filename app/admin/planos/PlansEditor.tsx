'use client';

import { useState } from 'react';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import type { Plan } from '@/data/seed';
import { cn } from '@/lib/utils';

import { deletePlanAction, resetPlansAction, savePlanAction } from '../actions';

const inputClass =
  'w-full min-h-[44px] rounded-xl border border-hairline bg-white/[.04] px-3 py-2 text-sm text-foreground focus:border-crimson focus:outline-none';

/**
 * Edição dos planos que aparecem na landing page.
 *
 * O que for salvo aqui vira a vitrine do site, então o formulário mostra
 * exatamente os campos que o visitante lê — nada de configuração escondida.
 */
export function PlansEditor({ plans }: { readonly plans: readonly Plan[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const form = (plan: Plan | null, onClose: () => void) => (
    <ActionForm
      action={savePlanAction}
      className="surface-card mt-4 p-5"
      onDone={(result) => {
        if (result.ok) onClose();
      }}
    >
      {plan ? <input type="hidden" name="id" value={plan.id} /> : null}

      <h3 className="text-base normal-case tracking-normal">
        {plan ? `Editar ${plan.name}` : 'Novo plano'}
      </h3>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor={`nome-${plan?.id ?? 'novo'}`} className="block text-xs text-muted">
            Nome
          </label>
          <input
            id={`nome-${plan?.id ?? 'novo'}`}
            name="name"
            type="text"
            required
            defaultValue={plan?.name ?? ''}
            placeholder="Mensal"
            className={cn(inputClass, 'mt-1')}
          />
        </div>

        <div>
          <label htmlFor={`preco-${plan?.id ?? 'novo'}`} className="block text-xs text-muted">
            Valor exibido
          </label>
          <input
            id={`preco-${plan?.id ?? 'novo'}`}
            name="priceLabel"
            type="text"
            required
            defaultValue={plan?.priceLabel ?? ''}
            placeholder="R$ 150"
            className={cn(inputClass, 'mt-1')}
          />
        </div>

        <div>
          <label htmlFor={`periodo-${plan?.id ?? 'novo'}`} className="block text-xs text-muted">
            Período
          </label>
          <input
            id={`periodo-${plan?.id ?? 'novo'}`}
            name="periodLabel"
            type="text"
            defaultValue={plan?.periodLabel ?? '/mês'}
            placeholder="/mês"
            className={cn(inputClass, 'mt-1')}
          />
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor={`resumo-${plan?.id ?? 'novo'}`} className="block text-xs text-muted">
          Frase de apoio
        </label>
        <input
          id={`resumo-${plan?.id ?? 'novo'}`}
          name="summary"
          type="text"
          defaultValue={plan?.summary ?? ''}
          placeholder="Sem fidelidade. Bom para quem está começando."
          className={cn(inputClass, 'mt-1')}
        />
      </div>

      <div className="mt-3">
        <label htmlFor={`itens-${plan?.id ?? 'novo'}`} className="block text-xs text-muted">
          O que está incluso — uma linha por item
        </label>
        <textarea
          id={`itens-${plan?.id ?? 'novo'}`}
          name="features"
          rows={4}
          defaultValue={plan?.features.join('\n') ?? ''}
          placeholder={'Acesso a uma modalidade\nHorários livres dentro da grade'}
          className={cn(inputClass, 'mt-1 resize-y')}
        />
      </div>

      <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm">
        <input
          type="checkbox"
          name="highlighted"
          defaultChecked={plan?.highlighted ?? false}
          className="h-5 w-5 accent-crimson"
        />
        <span className="text-foreground">
          Destacar como &ldquo;Mais escolhido&rdquo;
          <span className="block text-xs text-muted">
            Só um plano pode ficar em destaque; marcar este tira o destaque do outro.
          </span>
        </span>
      </label>

      <div className="mt-4 flex flex-wrap gap-3">
        <SubmitButton>Salvar plano</SubmitButton>
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
          {creating ? 'Fechar' : 'Adicionar plano'}
        </button>

        <ActionForm
          action={resetPlansAction}
          confirm="Restaurar os planos de exemplo? Os valores que você cadastrou serão perdidos."
        >
          <SubmitButton className="btn-ghost text-xs" pendingLabel="…">
            Restaurar exemplos
          </SubmitButton>
        </ActionForm>
      </div>

      {creating ? form(null, () => setCreating(false)) : null}

      <ul className="mt-6 grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <li
            key={plan.id}
            className={cn(
              'rounded-2xl border p-5 backdrop-blur-md',
              plan.highlighted
                ? 'border-crimson/50 bg-crimson/[.06]'
                : 'border-hairline bg-white/[.04]',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg normal-case tracking-normal">{plan.name}</h3>
              {plan.highlighted ? (
                <span className="shrink-0 rounded-full bg-crimson px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                  Destaque
                </span>
              ) : null}
            </div>

            <p className="mt-2 font-display text-2xl leading-none">
              {plan.priceLabel}
              <span className="ml-1 text-sm font-normal text-muted">{plan.periodLabel}</span>
            </p>

            {plan.summary ? (
              <p className="mt-2 text-xs leading-relaxed text-muted">{plan.summary}</p>
            ) : null}

            {plan.features.length > 0 ? (
              <ul className="mt-3 space-y-1 text-xs text-muted">
                {plan.features.map((feature) => (
                  <li key={feature}>· {feature}</li>
                ))}
              </ul>
            ) : null}

            {plan.isExample ? (
              <p className="mt-3 rounded-lg border border-dashed border-crimson/40 px-2 py-1 text-[11px] text-muted">
                Valor de exemplo — aparece com aviso no site.
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={() => {
                  setEditing(editing === plan.id ? null : plan.id);
                  setCreating(false);
                }}
                className="btn-ghost text-xs"
              >
                {editing === plan.id ? 'Fechar' : 'Editar'}
              </button>

              <ActionForm
                action={deletePlanAction}
                confirm={`Remover o plano ${plan.name} do site?`}
              >
                <input type="hidden" name="id" value={plan.id} />
                <SubmitButton className="btn-ghost text-xs text-crimson" pendingLabel="…">
                  Remover
                </SubmitButton>
              </ActionForm>
            </div>
          </li>
        ))}
      </ul>

      {editing ? form(plans.find((p) => p.id === editing) ?? null, () => setEditing(null)) : null}
    </div>
  );
}
