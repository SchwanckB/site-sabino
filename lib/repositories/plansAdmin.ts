import 'server-only';

import { plans as seedPlans, type Plan } from '@/data/seed';
import { getRedis, redisKeys } from '@/lib/redis';
import { asBoolean, asString, asStringArray, isRecord } from '@/lib/repositories/parse';

/**
 * Planos exibidos na landing page (`landing:plans`).
 *
 * Mesma disciplina da grade de horários: o que o admin salva aparece no site
 * público, então tudo é validado e normalizado antes de persistir — um campo
 * torto aqui vira preço errado na vitrine.
 *
 * Sem nada no Redis, cai para `data/seed.ts`, que ainda está marcado como
 * exemplo e por isso exibe o aviso de "valores não confirmados".
 */

export interface PlanSet {
  readonly plans: readonly Plan[];
  readonly updatedAt: string | null;
}

const MAX_PLANS = 6;
const MAX_FEATURES = 10;

function parsePlan(value: unknown): Plan | null {
  if (!isRecord(value)) return null;

  const id = asString(value['id']);
  const name = asString(value['name']);
  if (id.length === 0 || name.length === 0) return null;

  return {
    id,
    name,
    priceLabel: asString(value['priceLabel'], 'Sob consulta'),
    periodLabel: asString(value['periodLabel'], '/mês'),
    summary: asString(value['summary']),
    features: asStringArray(value['features']).slice(0, MAX_FEATURES),
    highlighted: asBoolean(value['highlighted'], false),
    // Vindo do Redis, foi o admin quem escreveu: não é mais exemplo.
    isExample: asBoolean(value['isExample'], false),
  };
}

/** Planos para a landing page. Redis quando houver, seed como reserva. */
export async function getPlans(): Promise<PlanSet> {
  const redis = getRedis();
  if (!redis) return { plans: seedPlans, updatedAt: null };

  try {
    const raw = await redis.get<unknown>(redisKeys.landingPlans());
    const source = Array.isArray(raw) ? { plans: raw, updatedAt: null } : raw;
    if (!isRecord(source)) return { plans: seedPlans, updatedAt: null };

    const list = source['plans'];
    if (!Array.isArray(list)) return { plans: seedPlans, updatedAt: null };

    const parsed: Plan[] = [];
    for (const item of list) {
      const plan = parsePlan(item);
      if (plan) parsed.push(plan);
    }

    if (parsed.length === 0) return { plans: seedPlans, updatedAt: null };

    return {
      plans: parsed.slice(0, MAX_PLANS),
      updatedAt: asString(source['updatedAt']) || null,
    };
  } catch (error) {
    console.error('[plans] falha ao ler landing:plans, usando o seed', error);
    return { plans: seedPlans, updatedAt: null };
  }
}

export interface PlanInput {
  readonly id?: string;
  readonly name: string;
  readonly priceLabel: string;
  readonly periodLabel: string;
  readonly summary: string;
  /** Uma vantagem por linha, como o admin digita. */
  readonly features: string;
  readonly highlighted: boolean;
}

export type PlanValidation =
  | { readonly ok: true; readonly plan: Plan }
  | { readonly ok: false; readonly error: string };

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
}

export function validatePlan(input: PlanInput): PlanValidation {
  const name = input.name.trim();
  if (name.length < 2) {
    return { ok: false, error: 'Informe o nome do plano.' };
  }

  const priceLabel = input.priceLabel.trim();
  if (priceLabel.length === 0) {
    return { ok: false, error: 'Informe o valor (ou "Sob consulta").' };
  }

  const features = input.features
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, MAX_FEATURES);

  const id = input.id && input.id.length > 0 ? input.id : slugify(name) || `plano-${Date.now()}`;

  return {
    ok: true,
    plan: {
      id,
      name,
      priceLabel,
      periodLabel: input.periodLabel.trim() || '/mês',
      summary: input.summary.trim(),
      features,
      highlighted: input.highlighted,
      isExample: false,
    },
  };
}

async function persist(plans: readonly Plan[], now: Date): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  // Só um plano pode ficar em destaque — dois "mais escolhido" na vitrine
  // confundem mais do que vendem.
  let destaqueUsado = false;
  const normalized = plans.slice(0, MAX_PLANS).map((plan) => {
    if (plan.highlighted && !destaqueUsado) {
      destaqueUsado = true;
      return plan;
    }
    return { ...plan, highlighted: false };
  });

  await redis.set(
    redisKeys.landingPlans(),
    JSON.stringify({ plans: normalized, updatedAt: now.toISOString() }),
  );
}

export async function upsertPlan(input: PlanInput, now: Date): Promise<PlanValidation> {
  const validation = validatePlan(input);
  if (!validation.ok) return validation;

  const current = (await getPlans()).plans;
  const index = current.findIndex((item) => item.id === validation.plan.id);

  if (index < 0 && current.length >= MAX_PLANS) {
    return { ok: false, error: `Máximo de ${MAX_PLANS} planos na página.` };
  }

  // Um novo destaque tira o destaque dos demais.
  const next = (
    index >= 0
      ? current.map((item) => (item.id === validation.plan.id ? validation.plan : item))
      : [...current, validation.plan]
  ).map((item) =>
    validation.plan.highlighted && item.id !== validation.plan.id
      ? { ...item, highlighted: false }
      : item,
  );

  await persist(next, now);
  return validation;
}

export async function removePlan(planId: string, now: Date): Promise<void> {
  const current = (await getPlans()).plans;
  const next = current.filter((item) => item.id !== planId);

  if (next.length === 0) {
    // Lista vazia faria a leitura cair no seed e os planos de exemplo
    // voltariam a aparecer no site. Melhor recusar.
    throw new Error('Mantenha ao menos um plano na página.');
  }

  await persist(next, now);
}

/** Restaura os planos de exemplo do `data/seed.ts`. */
export async function resetPlansToSeed(now: Date): Promise<void> {
  await persist(seedPlans, now);
}
