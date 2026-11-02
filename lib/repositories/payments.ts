import 'server-only';

import { getRedis, redisKeys } from '@/lib/redis';
import { asInteger, asNullableString, asString, emptyToNull } from '@/lib/repositories/parse';
import type {
  PaymentEntry,
  PaymentMethod,
  PaymentPlanRecord,
  PlanChangeEntry,
} from '@/types/domain';
import { saoPauloDateString } from '@/utils/datetime';
import { SCORE_MIN } from '@/utils/redisScore';
import {
  DEFAULT_GRACE_DAYS,
  PLAN_MONTHS,
  applyPayment,
  firstDueDate,
  installmentCents,
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
    // Vazio nas mensalidades criadas antes deste campo existir: a interface
    // mostra só o período nesse caso, sem precisar migrar nada.
    planName: asString(row['planName']),
    amountCents: asInteger(row['amountCents'], 0),
    // Campos que entraram depois: mensalidade antiga não os tem, e o padrão
    // zero mantém o comportamento de antes — sem desconto e sem crédito.
    discountCents: Math.max(0, asInteger(row['discountCents'], 0)),
    discountReason: asString(row['discountReason']),
    creditCents: Math.max(0, asInteger(row['creditCents'], 0)),
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
  /**
   * Nome do plano contratado, escolhido entre os da vitrine. Opcional: a
   * academia pode definir uma mensalidade avulsa, sem plano correspondente.
   */
  readonly planName?: string;
  /** Valor de tabela, antes do desconto. */
  readonly amountCents: number;
  /** Desconto por parcela. Ausente preserva o que já estava gravado. */
  readonly discountCents?: number;
  readonly discountReason?: string;
  readonly dueDay: number;
  readonly graceDays: number;
  /** Primeiro vencimento. Em branco, é calculado a partir de hoje. */
  readonly firstDueDate?: string;
  /** Quem fez a mudança — entra no histórico de valor. */
  readonly registeredBy?: string;
  /** Motivo do reajuste ou do desconto, para o histórico. */
  readonly changeNote?: string;
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
    // Nome do plano some se o formulário não mandar nada; preserva o que já
    // estava gravado para não perder o rótulo numa edição de valor.
    planName: (input.planName ?? existing?.planName ?? '').trim().slice(0, 60),
    amountCents: Math.max(0, Math.trunc(input.amountCents)),
    discountCents: Math.max(0, Math.trunc(input.discountCents ?? existing?.discountCents ?? 0)),
    discountReason: (input.discountReason ?? existing?.discountReason ?? '').trim().slice(0, 80),
    // Crédito é dinheiro do aluno em caixa: mexer na mensalidade não pode
    // fazê-lo desaparecer.
    creditCents: existing?.creditCents ?? 0,
    dueDay,
    graceDays: Math.max(0, Math.trunc(input.graceDays)),
    dueDate,
    lastPaidAt: existing?.lastPaidAt ?? null,
  };

  const tx = redis.multi();
  tx.hset(redisKeys.payment(plan.userId), {
    planId: plan.planId,
    planName: plan.planName,
    amountCents: plan.amountCents,
    discountCents: plan.discountCents,
    discountReason: plan.discountReason,
    creditCents: plan.creditCents,
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

  /*
   * Reajuste e desconto entram no histórico.
   *
   * Sem isto, o valor anterior desaparecia no momento da edição, e com ele a
   * resposta de "quanto ele pagava antes" — que é a pergunta do aluno quando
   * reclama do reajuste, e a do professor quando precisa justificá-lo.
   */
  const mudouValor = existing !== null && existing.amountCents !== plan.amountCents;
  const mudouDesconto = existing !== null && existing.discountCents !== plan.discountCents;

  if (mudouValor || mudouDesconto) {
    const change: PlanChangeEntry = {
      at: now.toISOString(),
      fromCents: existing.amountCents,
      toCents: plan.amountCents,
      fromDiscountCents: existing.discountCents,
      toDiscountCents: plan.discountCents,
      registeredBy: input.registeredBy ?? '',
      note: input.changeNote ?? '',
    };
    tx.lpush(redisKeys.planHistory(plan.userId), JSON.stringify(change));
    tx.ltrim(redisKeys.planHistory(plan.userId), 0, MAX_PLAN_HISTORY - 1);
  }

  await tx.exec();

  return plan;
}

/** Quantas mudanças de valor ficam guardadas por aluno. */
const MAX_PLAN_HISTORY = 40;

/** Histórico de valor da mensalidade, do mais recente para o mais antigo. */
export async function listPlanHistory(
  userId: string,
  limit = 20,
): Promise<PlanChangeEntry[]> {
  const redis = getRedis();
  if (!redis) return [];

  const raw = await redis.lrange<unknown>(redisKeys.planHistory(userId), 0, limit - 1);

  const entries: PlanChangeEntry[] = [];
  for (const item of raw) {
    const parsed = typeof item === 'string' ? safeParse(item) : item;
    if (!parsed || typeof parsed !== 'object') continue;
    const row = parsed as Record<string, unknown>;

    entries.push({
      at: asString(row['at']),
      fromCents: asInteger(row['fromCents'], 0),
      toCents: asInteger(row['toCents'], 0),
      fromDiscountCents: asInteger(row['fromDiscountCents'], 0),
      toDiscountCents: asInteger(row['toDiscountCents'], 0),
      registeredBy: asString(row['registeredBy']),
      note: asString(row['note']),
    });
  }

  return entries;
}

export interface RegisterPaymentInput {
  readonly method: PaymentMethod;
  /** Valor recebido. Ausente significa o valor da parcela, já com desconto. */
  readonly amountCents?: number;
  readonly registeredBy: string;
}

export interface RegisteredPayment {
  readonly plan: PaymentPlanRecord;
  readonly entry: PaymentEntry;
  /** `true` quando o valor não fechou a parcela e virou crédito. */
  readonly partial: boolean;
}

/**
 * Registra o dinheiro que entrou.
 *
 * Deixou de ser "marcar como pago": o valor recebido é distribuído pelas
 * parcelas em aberto por {@link applyPayment}, então um pagamento parcial
 * entra no histórico sem vencer nada, e um adiantamento fecha quantas parcelas
 * couberem. Antes, qualquer valor diferente da parcela empurrava o vencimento
 * um mês — quem pagava metade ficava quitado, e quem pagava três meses de uma
 * vez perdia dois.
 *
 * Tudo numa transação, com o índice de cobrança e o número do recibo junto.
 */
export async function registerPayment(
  plan: PaymentPlanRecord,
  input: RegisterPaymentInput,
  now: Date,
): Promise<RegisteredPayment> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  const parcela = installmentCents(plan);
  const recebido = Math.max(0, Math.trunc(input.amountCents ?? parcela));
  const aplicado = applyPayment(plan, recebido);
  const timestamp = now.toISOString();

  /*
   * O recibo é numerado fora da transação, por `INCR`.
   *
   * Pular um número quando a gravação falha é aceitável; repetir um número de
   * recibo não é — dois alunos com o mesmo "Recibo nº 42" é exatamente o que
   * um recibo não pode fazer.
   */
  let receiptNumber = 0;
  try {
    receiptNumber = await redis.incr(redisKeys.receiptSeq());
  } catch (error) {
    console.error('[payments] falha ao numerar o recibo', error);
  }

  const entry: PaymentEntry = {
    paidAt: timestamp,
    referenceMonth: referenceMonth(plan),
    amountCents: recebido,
    method: input.method,
    registeredBy: input.registeredBy,
    coveredUntil: aplicado.nextDueDate,
    dueDate: plan.dueDate,
    installments: aplicado.installmentsPaid,
    creditBeforeCents: plan.creditCents,
    receiptNumber,
  };

  const tx = redis.multi();
  tx.hset(redisKeys.payment(plan.userId), {
    dueDate: aplicado.nextDueDate,
    creditCents: aplicado.creditCents,
    // Pagamento parcial também é pagamento: a data do último recebimento
    // conta, e é dela que sai a leitura de "pagou depois da cobrança".
    lastPaidAt: timestamp,
    updatedAt: timestamp,
  });
  tx.lpush(redisKeys.paymentsHistory(plan.userId), JSON.stringify(entry));
  tx.zadd(redisKeys.paymentsDue(), {
    score: dayNumber(aplicado.nextDueDate),
    member: plan.userId,
  });
  await tx.exec();

  return {
    plan: {
      ...plan,
      dueDate: aplicado.nextDueDate,
      creditCents: aplicado.creditCents,
      lastPaidAt: timestamp,
    },
    entry,
    partial: aplicado.installmentsPaid === 0,
  };
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

  const history = await listPaymentHistory(plan.userId, 2);
  const ultimo = history[0] ?? null;
  const previousPaidAt = history[1]?.paidAt ?? null;

  /*
   * Desfazer volta exatamente o que aquele pagamento fez.
   *
   * Com parcial e adiantado, um pagamento pode ter fechado zero, uma ou três
   * parcelas — então o vencimento volta pelo número de parcelas registrado no
   * próprio lançamento, e o crédito é reposto como estava antes dele. Voltar
   * um mês fixo, como antes, desfazia errado em qualquer caso que não fosse o
   * pagamento exato.
   */
  const parcelas = ultimo?.installments ?? 1;
  const previousDueDate =
    parcelas <= 0
      ? plan.dueDate
      : // `rollbackDueDate` volta um período; repetir é o caminho honesto, e
        // o número de parcelas de um lançamento é sempre pequeno.
        Array.from({ length: parcelas }).reduce<string>(
          (data) => rollbackDueDate({ ...plan, dueDate: data }),
          plan.dueDate,
        );

  const previousCredit = ultimo?.creditBeforeCents ?? 0;

  const tx = redis.multi();
  tx.hset(redisKeys.payment(plan.userId), {
    dueDate: previousDueDate,
    creditCents: previousCredit,
    lastPaidAt: previousPaidAt ?? '',
    updatedAt: now.toISOString(),
  });
  tx.lpop(redisKeys.paymentsHistory(plan.userId));
  tx.zadd(redisKeys.paymentsDue(), {
    score: dayNumber(previousDueDate),
    member: plan.userId,
  });
  await tx.exec();

  return {
    ...plan,
    dueDate: previousDueDate,
    creditCents: previousCredit,
    lastPaidAt: previousPaidAt,
  };
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
      // Vazio e zero nos pagamentos anteriores a estes campos. A análise de
      // atraso ignora quem não tem vencimento gravado, em vez de supor.
      dueDate: asString(row['dueDate']),
      installments: asInteger(row['installments'], 1),
      creditBeforeCents: Math.max(0, asInteger(row['creditBeforeCents'], 0)),
      receiptNumber: Math.max(0, asInteger(row['receiptNumber'], 0)),
    });
  }

  return entries;
}

/** IDs com parcela vencida hoje, direto do índice. */
export async function listOverdueIds(now: Date): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];

  const today = dayNumber(saoPauloDateString(now));

  try {
    // Ver a nota em students.ts: SCORE_MIN é obrigatório aqui.
    return await redis.zrange<string[]>(redisKeys.paymentsDue(), SCORE_MIN, today - 1, {
      byScore: true,
    });
  } catch (error) {
    console.error('[payments] falha ao ler payments:due', error);
    return [];
  }
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
