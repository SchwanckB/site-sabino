import type { Metadata } from 'next';

import { getPlans } from '@/lib/repositories/plansAdmin';

import { PlansEditor } from './PlansEditor';

export const metadata: Metadata = { title: 'Planos' };
export const dynamic = 'force-dynamic';

export default async function PlanosPage() {
  const { plans } = await getPlans();
  const temExemplo = plans.some((plan) => plan.isExample);

  return (
    <div>
      <header>
        <p className="eyebrow">Vitrine</p>
        <h1 className="mt-2 text-3xl leading-none sm:text-4xl">Planos</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          São os planos que aparecem na página pública. O que você salvar aqui entra no site
          imediatamente.
        </p>
      </header>

      {temExemplo ? (
        <p
          role="note"
          className="mt-6 rounded-xl border border-dashed border-crimson/40 bg-crimson/[.06] px-4 py-3 text-xs leading-relaxed text-muted"
        >
          Alguns planos ainda têm valores de exemplo (R$ 000) e o site exibe um aviso de
          &ldquo;valores não confirmados&rdquo;. Edite cada um com o preço real para o aviso sumir.
        </p>
      ) : null}

      <div className="mt-8">
        <PlansEditor plans={plans} />
      </div>
    </div>
  );
}
