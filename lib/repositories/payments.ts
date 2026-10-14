import 'server-only';

import { getRedis, redisKeys } from '@/lib/redis';
import { asInteger, asNullableString, asString, emptyToNull } from '@/lib/repositories/parse';
import type { PaymentEntry, PaymentMethod, PaymentPlanRecord } from '@/types/domain';
import { saoPauloDateString } from '@/utils/datetime';
import {
  DEFAULT_GRACE_DAYS,
  PLAN_MONTHS,
  advanceDueDate,
  firstDueDate,
  getPaymentSummary,
  normalizeDueDay,
  referenceMonth,
  rollbackDueDate,
  type PaymentSummary,
  type PlanId,
} from '@/utils/paymentEngine';

/**
 * Mensalidade do aluno (`payment:{userId}`) e histórico (`payments:history:{userId}`).
 *
 * `payments:due` é um ZSET com score = dia do vencimento em aberto, o que
 * responde "quem está inadimplente" e "quem vence nos próximos dias" sem
 * varrer a base.
 */

function dayNumber(isoDate: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return 0;
  const [, year, month, day] = match;
  return Math.floor(Date.UTC(Number(year), Number(month) - 1, Number(day)) / 86_400_000);
}

const PLAN_IDS: readonly PlanId[] = ['mensal', 'trimestral', 'anual'];

function rowToPlan(userId: string, row: Record<string, unknown>): PaymentPlanRecord {
  const planId = asString(row['planId'], 'mensal');

  return {
    userId,
    planId: (PLAN_IDS as readonly string[]).includes(planId) ? (planId as PlanId) : 'mensal',
    amountCents: asInteger(row['amountCents'], 0),
    dueDay: normalizeDueDay(asInteger(row['dueDay'], 1)),
    graceDays: Math.max(0, asInteger(row['graceDays'], DEFAULT_GRACE_DAYS)),
    dueDate: asString(row['dueDate']),
    lastPaidAt: asNullableString(row['lastPaidAt']),
  };
}

export async function getPaymentPlan(userId: string): Promise<PaymentPlanRecord | null> {
  const redis = getRedis();
  if (!redis) return null;

  const row = emptyToNull(
    await redis.hgetall<Record<string, unknown>>(redisKeys.payment(userId)),
  );
  if (!row) return null;

  const plan = rowToPlan(userId, row);
  return plan.dueDate.length > 0 ? plan : null;
}

export async function getPaymentPlans(
  userIds: readonly string[],
): Promise<Map<string, PaymentPlanRecord>> {
  const redis = getRedis();
  const result = new Map<string, PaymentPlanRecord>();
  if (!redis || userIds.length === 0) return result;

  const pipeline = redis.pipeline();
  for (const id of userIds) {
    pipeline.hgetall(redisKeys.payment(id));
  }
  const rows = (await pipeline.exec()) as (Record<string, unknown> | null)[];

  rows.forEach((row, index) => {
    const id = userIds[index];
    const clean = emptyToNull(row);
    if (!id || !clean) return;
    const plan = rowToPlan(id, clean);
    if (plan.dueDate.length > 0) result.set(id, plan);
  });

  return result;
}

export interface SetupPlanInput {
  readonly userId: string;
  readonly planId: PlanId;
  readonly amountCents: number;
  readonly dueDay: number;
  readonly graceDays: number;
  /** Primeiro vencimento. Em branco, é calculado a partir de hoje. */
  readonly firstDueDate?: string;
}

/**
 * Define a mensalidade na aprovação do cadastro — ou quando o admin muda o
 * combinado com o aluno.
 */
export async function setupPaymentPlan(
  input: SetupPlanInput,
  now: Date,
): Promise<PaymentPlanRecord> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  const dueDay = normalizeDueDay(input.dueDay);
  const dueDate =
    input.firstDueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.firstDueDate)
      ? input.firstDueDate
      : firstDueDate(now, dueDay);

  const existing = await getPaymentPlan(input.userId);

  const plan: PaymentPlanRecord = {
    userId: input.userId,
    planId: input.planId,
    amountCents: Math.max(0, Math.trunc(input.amountCents)),
    dueDay,
    graceDays: Math.max(0, Math.trunc(input.graceDays)),
    dueDate,
    lastPaidAt: existing?.lastPaidAt ?? null,
  };

  const tx = redis.multi();
  tx.hset(redisKeys.payment(plan.userId), {
    planId: plan.planId,
    amountCents: plan.amountCents,
    dueDay: plan.dueDay,
    graceDays: plan.graceDays,
    dueDate: plan.dueDate,
    lastPaidAt: plan.lastPaidAt ?? '',
    updatedAt: now.toISOString(),
  });
  tx.zadd(redisKeys.paymentsDue(), {
    score: dayNumber(plan.dueDate),
    member: plan.userId,
  });
  await tx.exec();

  return plan;
}

export interface RegisterPaymentInput {
  readonly method: PaymentMethod;
  readonly amountCents?: number;
  readonly registeredBy: string;
}

/**
 * "Marcar como pago": grava a parcela no histórico e empurra o vencimento
 * conforme o plano. Tudo em uma transação, com o índice de cobrança junto.
 */
export async function registerPayment(
  plan: PaymentPlanRecord,
  input: RegisterPaymentInput,
  now: Date,
): Promise<PaymentPlanRecord> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  const nextDueDate = advanceDueDate(plan);
  const timestamp = now.toISOString();

  const entry: PaymentEntry = {
    paidAt: timestamp,
    referenceMonth: referenceMonth(plan),
    amountCents: input.amountCents ?? plan.amountCents,
    method: input.method,
    registeredBy: input.registeredBy,
    coveredUntil: nextDueDate,
  };

  const tx = redis.multi();
  tx.hset(redisKeys.payment(plan.userId), {
    dueDate: nextDueDate,
    lastPaidAt: timestamp,
    updatedAt: timestamp,
  });
  tx.lpush(redisKeys.paymentsHistory(plan.userId), JSON.stringify(entry));
  tx.zadd(redisKeys.paymentsDue(), {
    score: dayNumber(nextDueDate),
    member: plan.userId,
  });
  await tx.exec();

  return { ...plan, dueDate: nextDueDate, lastPaidAt: timestamp };
}

/**
 * Desfaz o último pagamento: volta o vencimento e remove a entrada do topo do
 * histórico. Para quando o admin marca o aluno errado.
 */
export async function undoLastPayment(
  plan: PaymentPlanRecord,
  now: Date,
): Promise<PaymentPlanRecord> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  const previousDueDate = rollbackDueDate(plan);
  const history = await listPaymentHistory(plan.userId, 2);
  const previousPaidAt = history[1]?.paidAt ?? null;

  const tx = redis.multi();
  tx.hset(redisKeys.payment(plan.userId), {
    dueDate: previousDueDate,
    lastPaidAt: previousPaidAt ?? '',
    updatedAt: now.toISOString(),
  });
  tx.lpop(redisKeys.paymentsHistory(plan.userId));
  tx.zadd(redisKeys.paymentsDue(), {
    score: dayNumber(previousDueDate),
    member: plan.userId,
  });
  await tx.exec();

  return { ...plan, dueDate: previousDueDate, lastPaidAt: previousPaidAt };
}

export async function listPaymentHistory(
  userId: string,
  limit = 24,
): Promise<PaymentEntry[]> {
  const redis = getRedis();
  if (!redis) return [];

  const raw = await redis.lrange<unknown>(redisKeys.paymentsHistory(userId), 0, limit - 1);

  const entries: PaymentEntry[] = [];
  for (const item of raw) {
    const parsed = typeof item === 'string' ? safeParse(item) : item;
    if (!parsed || typeof parsed !== 'object') continue;
    const row = parsed as Record<string, unknown>;

    entries.push({
      paidAt: asString(row['paidAt']),
      referenceMonth: asString(row['referenceMonth']),
      amountCents: asInteger(row['amountCents'], 0),
      method: asString(row['method'], 'outro'),
      registeredBy: asString(row['registeredBy']),
      coveredUntil: asString(row['coveredUntil']),
    });
  }

  return entries;
}

/** IDs com parcela vencida hoje, direto do índice. */
export async function listOverdueIds(now: Date): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];

  const today = dayNumber(saoPauloDateString(now));
  return redis.zrange<string[]>(
    redisKeys.paymentsDue(),
    Number.NEGATIVE_INFINITY,
    today - 1,
    { byScore: true },
  );
}

/** Resumo financeiro de vários alunos de uma vez. */
export function summarize(
  plans: Map<string, PaymentPlanRecord>,
  now: Date,
): Map<string, PaymentSummary> {
  const result = new Map<string, PaymentSummary>();
  for (const [id, plan] of plans) {
    result.set(id, getPaymentSummary(plan, now));
  }
  return result;
}

export { PLAN_MONTHS };

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
