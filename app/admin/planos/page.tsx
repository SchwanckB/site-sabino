import type { Metadata } from 'next';

import { PageHeader } from '@/components/app/PageHeader';

import { getPlans } from '@/lib/repositories/plansAdmin';

import { PlansEditor } from './PlansEditor';

export const metadata: Metadata = { title: 'Planos' };
export const dynamic = 'force-dynamic';

export default async function PlanosPage() {
  const { plans } = await getPlans();
  const temExemplo = plans.some((plan) => plan.isExample);

  return (
    <div>
      <PageHeader
        title="Planos"
      />

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
