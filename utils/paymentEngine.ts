/**
 * Motor financeiro — Sabino Academia.
 *
 * Função pura, sem I/O, recebendo `now: Date` por parâmetro.
 *
 * Modelo (o que o administrador combina com o aluno na aprovação):
 *   - `dueDay`     dia do mês em que a mensalidade vence (ex.: 11)
 *   - `graceDays`  tolerância depois do vencimento (ex.: 4 → paga até o dia 15)
 *   - `dueDate`    vencimento da **parcela em aberto mais antiga**
 *
 * Marcar como pago avança `dueDate` um mês. Se o aluno ficar meses sem pagar,
 * `dueDate` fica para trás e {@link getPaymentSummary} informa quantas parcelas
 * estão abertas — em vez de simplesmente "vencida".
 */

import { addDays, addMonths, daysBetween, saoPauloDateString } from './datetime';

/** Semáforo da mensalidade: verde, amarelo e vermelho. */
export type PaymentStatus = 'em_dia' | 'vence_em_breve' | 'vencida';

/** Dias de antecedência em que a mensalidade passa a aparecer em amarelo. */
export const DUE_SOON_DAYS = 5;

/** Tolerância padrão depois do vencimento, quando o admin não informa outra. */
export const DEFAULT_GRACE_DAYS = 4;

export type PlanId = 'mensal' | 'trimestral' | 'anual';

/** Quantos meses cada plano cobre por pagamento. */
export const PLAN_MONTHS: Readonly<Record<PlanId, number>> = {
  mensal: 1,
  trimestral: 3,
  anual: 12,
};

export const PLAN_LABELS: Readonly<Record<PlanId, string>> = {
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  anual: 'Anual',
};

export interface PaymentPlan {
  readonly userId: string;
  readonly planId: PlanId;
  /** Valor da parcela em centavos — inteiro, nunca float. */
  readonly amountCents: number;
  /** Dia do vencimento (1 a 31). Meses curtos usam o último dia. */
  readonly dueDay: number;
  readonly graceDays: number;
  /** Vencimento da parcela em aberto mais antiga, `YYYY-MM-DD`. */
  readonly dueDate: string;
  readonly lastPaidAt: string | null;
}

export interface PaymentSummary {
  readonly userId: string;
  readonly status: PaymentStatus;
  readonly dueDate: string;
  /** Último dia para pagar sem ficar vencida (`dueDate + graceDays`). */
  readonly limitDate: string;
  /** Dias até o vencimento; negativo quando já passou. */
  readonly daysUntilDue: number;
  /** Dias desde o fim da tolerância; `0` enquanto não vence. */
  readonly daysOverdue: number;
  /** Parcelas em aberto, incluindo a do mês corrente. Nunca menor que 1. */
  readonly openInstallments: number;
  readonly totalOpenCents: number;
  readonly amountCents: number;
  readonly planId: PlanId;
  readonly lastPaidAt: string | null;
}

/** Normaliza um dia de vencimento informado pelo admin. */
export function normalizeDueDay(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.min(Math.max(Math.trunc(day), 1), 31);
}

/**
 * Primeiro vencimento a partir da aprovação.
 *
 * Se o dia combinado ainda não passou no mês da matrícula, vence neste mês;
 * caso contrário, no mês seguinte. Assim o aluno aprovado no dia 3 com
 * vencimento no 11 paga ainda neste mês, e o aprovado no dia 20 só no próximo.
 */
export function firstDueDate(approvedAt: Date, dueDay: number): string {
  const today = saoPauloDateString(approvedAt);
  const day = normalizeDueDay(dueDay);
  const thisMonth = addMonths(today, 0, day);

  return daysBetween(thisMonth, today) >= 0 ? thisMonth : addMonths(today, 1, day);
}

/** Situação da mensalidade na data de referência. */
export function getPaymentSummary(plan: PaymentPlan, now: Date): PaymentSummary {
  const today = saoPauloDateString(now);
  const graceDays = Math.max(0, Math.trunc(plan.graceDays));
  const limitDate = addDays(plan.dueDate, graceDays);

  const daysUntilDue = daysBetween(plan.dueDate, today);
  const daysPastLimit = daysBetween(today, limitDate);

  let status: PaymentStatus;
  if (daysPastLimit > 0) {
    status = 'vencida';
  } else if (daysUntilDue <= DUE_SOON_DAYS) {
    status = 'vence_em_breve';
  } else {
    status = 'em_dia';
  }

  // Quantos vencimentos já passaram desde a parcela em aberto mais antiga.
  let openInstallments = 1;
  let cursor = plan.dueDate;
  while (daysBetween(today, cursor) >= 0 && openInstallments < 120) {
    const next = addMonths(cursor, 1, plan.dueDay);
    if (daysBetween(today, next) < 0) break;
    cursor = next;
    openInstallments += 1;
  }

  return {
    userId: plan.userId,
    status,
    dueDate: plan.dueDate,
    limitDate,
    daysUntilDue,
    daysOverdue: Math.max(0, daysPastLimit),
    openInstallments,
    totalOpenCents: openInstallments * plan.amountCents,
    amountCents: plan.amountCents,
    planId: plan.planId,
    lastPaidAt: plan.lastPaidAt,
  };
}

/**
 * Novo vencimento depois de registrar um pagamento.
 * O plano define quantos meses cada pagamento cobre.
 */
export function advanceDueDate(plan: PaymentPlan): string {
  return addMonths(plan.dueDate, PLAN_MONTHS[plan.planId], plan.dueDay);
}

/** Vencimento anterior — usado para desfazer um pagamento registrado por engano. */
export function rollbackDueDate(plan: PaymentPlan): string {
  return addMonths(plan.dueDate, -PLAN_MONTHS[plan.planId], plan.dueDay);
}

/** Mês de referência (`YYYY-MM`) da parcela em aberto mais antiga. */
export function referenceMonth(plan: PaymentPlan): string {
  return plan.dueDate.slice(0, 7);
}

/** Centavos → `R$ 150,00`. */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/** `R$ 150,00`, `150,00` ou `150.00` → centavos. Devolve `null` se não der. */
export function parseCentsInput(value: string): number | null {
  const cleaned = value.replace(/[^\d,.-]/g, '').trim();
  if (cleaned.length === 0) return null;

  // Com vírgula, o separador decimal é a vírgula e o ponto é milhar.
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;

  return Math.round(parsed * 100);
}

