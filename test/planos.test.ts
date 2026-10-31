import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { UpstashMock } from './upstashMock';

/**
 * Planos da vitrine.
 *
 * Existe por um caso concreto: a academia cadastrou "Trimestral" para o MMA e
 * depois "Trimestral" para o Jiu-Jitsu, e o segundo **apagou o primeiro**. O id
 * vinha do nome slugificado, os dois caíam em `trimestral`, e `upsertPlan`
 * tratava id repetido como edição. O plano sumia da vitrine sem nenhum aviso.
 */

const mock = new UpstashMock();

vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  unstable_cache: <T,>(fn: T): T => fn,
}));

let plans: typeof import('@/lib/repositories/plansAdmin');

beforeAll(async () => {
  const { url, token } = await mock.start();
  process.env['UPSTASH_REDIS_REST_URL'] = url;
  process.env['UPSTASH_REDIS_REST_TOKEN'] = token;

  plans = await import('@/lib/repositories/plansAdmin');
});

afterAll(async () => {
  await mock.stop();
});

beforeEach(() => {
  mock.reset();
});

const agora = new Date('2026-03-10T12:00:00Z');

/** Plano novo: sem `id`, como o formulário envia ao criar. */
function novo(name: string, extra: Partial<Parameters<typeof plans.upsertPlan>[0]> = {}) {
  return {
    name,
    priceLabel: 'R$ 150',
    periodLabel: '/mês',
    summary: '',
    features: '',
    highlighted: false,
    type: 'plano' as const,
    ...extra,
  };
}

/*
 * Com o Redis vazio a leitura cai em `data/seed.ts`, que já traz "Mensal",
 * "Trimestral" e "Anual". As asserções são relativas a essa linha de base — e
 * isso é proposital: é exatamente o cenário da academia, que começa com os
 * planos de exemplo na vitrine e cadastra os próprios por cima.
 */
async function quantos(): Promise<number> {
  return (await plans.getPlansFresh()).plans.length;
}

describe('criar plano nunca substitui outro', () => {
  it('dois planos com o mesmo nome convivem', async () => {
    const base = await quantos();

    const a = await plans.upsertPlan(novo('Trimestral', { summary: 'MMA' }), agora);
    const b = await plans.upsertPlan(novo('Trimestral', { summary: 'Jiu-Jitsu' }), agora);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    // Antes da correção: +1. O segundo "Trimestral" apagava o primeiro.
    expect(await quantos()).toBe(base + 2);

    const atuais = (await plans.getPlansFresh()).plans;
    expect(atuais.some((p) => p.summary === 'MMA')).toBe(true);
    expect(atuais.some((p) => p.summary === 'Jiu-Jitsu')).toBe(true);
  });

  it('o novo nunca reaproveita o id de um existente', async () => {
    const antes = (await plans.getPlansFresh()).plans.map((p) => p.id);

    const a = await plans.upsertPlan(novo('Trimestral'), agora);
    const b = await plans.upsertPlan(novo('Trimestral'), agora);
    if (!a.ok || !b.ok) throw new Error('deveria ter criado os dois');

    expect(antes).not.toContain(a.plan.id);
    expect(antes).not.toContain(b.plan.id);
    expect(a.plan.id).not.toBe(b.plan.id);
    // O id continua legível, derivado do nome.
    expect(a.plan.id.startsWith('trimestral')).toBe(true);
  });

  it('aguenta vários nomes iguais em sequência', async () => {
    const base = await quantos();

    for (let i = 0; i < 5; i += 1) {
      expect((await plans.upsertPlan(novo('Mensal'), agora)).ok).toBe(true);
    }

    expect(await quantos()).toBe(base + 5);

    const ids = (await plans.getPlansFresh()).plans.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('nomes diferentes que geram o mesmo slug também convivem', async () => {
    // `slugify` corta em 24 caracteres: estes dois colidiam no mesmo id.
    const longo1 = 'Plano trimestral completo MMA';
    const longo2 = 'Plano trimestral completo Jiu-Jitsu';

    await plans.upsertPlan(novo(longo1), agora);
    await plans.upsertPlan(novo(longo2), agora);

    const atuais = (await plans.getPlansFresh()).plans;
    expect(atuais.filter((p) => p.name === longo1 || p.name === longo2)).toHaveLength(2);
  });
});

describe('editar continua editando', () => {
  it('salvar com o id existente altera, não duplica', async () => {
    const criado = await plans.upsertPlan(novo('Trimestral', { summary: 'MMA' }), agora);
    if (!criado.ok) throw new Error('falhou ao criar');

    const antes = (await plans.getPlansFresh()).plans.length;

    const editado = await plans.upsertPlan(
      novo('Trimestral', { id: criado.plan.id, summary: 'MMA e Muay Thai' }),
      agora,
    );

    expect(editado.ok).toBe(true);
    const depois = (await plans.getPlansFresh()).plans;
    expect(depois).toHaveLength(antes);
    expect(depois.find((p) => p.id === criado.plan.id)?.summary).toBe('MMA e Muay Thai');
  });

  it('editar um plano mantém o id dele', async () => {
    const criado = await plans.upsertPlan(novo('Anual'), agora);
    if (!criado.ok) throw new Error('falhou ao criar');

    const editado = await plans.upsertPlan(
      novo('Anual renovado', { id: criado.plan.id }),
      agora,
    );

    if (!editado.ok) throw new Error('falhou ao editar');
    expect(editado.plan.id).toBe(criado.plan.id);
    expect(editado.plan.name).toBe('Anual renovado');
  });
});

describe('destaque', () => {
  it('um novo destaque tira o destaque dos outros', async () => {
    await plans.upsertPlan(novo('Mensal', { highlighted: true }), agora);
    await plans.upsertPlan(novo('Trimestral', { highlighted: true }), agora);

    const atuais = (await plans.getPlansFresh()).plans;
    expect(atuais.filter((p) => p.highlighted)).toHaveLength(1);
    expect(atuais.find((p) => p.highlighted)?.name).toBe('Trimestral');
  });
});
