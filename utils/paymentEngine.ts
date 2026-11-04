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
  /**
   * Nome do plano contratado, como aparece na vitrine — "Trimestral MMA",
   * "Mensal Jiu-Jitsu".
   *
   * É rótulo, não regra: quem decide a cobrança continua sendo `planId`
   * (período) e `amountCents` (valor). Serve para o aluno reconhecer o que
   * contratou e para o professor conferir sem abrir a ficha.
   *
   * Vazio nas mensalidades criadas antes deste campo existir — a interface
   * mostra só o período nesse caso, sem migração de dado.
   */
  readonly planName: string;
  /**
   * Valor de tabela da parcela, em centavos — inteiro, nunca float.
   *
   * É o combinado cheio, antes de desconto. Fica separado de {@link
   * PaymentPlan.discountCents} de propósito: baixar este número esconderia
   * que a academia dá desconto, e com ele some a resposta de "quanto deixo de
   * cobrar por mês".
   */
  readonly amountCents: number;
  /**
   * Desconto fixo por parcela, em centavos. Bolsa, irmão, combinado.
   *
   * Valor e não percentual: é assim que o acerto é feito no balcão ("paga
   * 120 em vez de 150"), e percentual sobre centavos geraria arredondamento
   * diferente a cada mês.
   */
  readonly discountCents?: number;
  /** Por que tem desconto. Aparece na ficha e no relatório. */
  readonly discountReason?: string;
  /**
   * Dinheiro recebido que ainda não fechou uma parcela.
   *
   * É o que torna o pagamento parcial possível: o aluno entrega 100 de uma
   * parcela de 150, os 100 ficam aqui, e o vencimento só avança quando a
   * soma alcançar o valor da parcela. Antes a baixa era tudo ou nada, e o
   * professor tinha de escolher entre dar a parcela por paga ou não registrar
   * nada — as duas erradas.
   */
  readonly creditCents?: number;
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
  /** Quanto falta entrar: parcelas abertas menos o crédito já recebido. */
  readonly totalOpenCents: number;
  /**
   * Valor a pagar por parcela, **já com o desconto aplicado**.
   *
   * Continua sendo este o campo que a cobrança, o recibo e a fila usam — era
   * assim antes do desconto existir, e mudar o significado faria toda tela
   * cobrar o valor de tabela de quem tem bolsa.
   */
  readonly amountCents: number;
  /** Valor de tabela, antes do desconto. Igual a `amountCents` sem desconto. */
  readonly grossCents: number;
  readonly discountCents: number;
  readonly discountReason: string;
  /** Crédito em caixa: pagamento parcial que ainda não fechou a parcela. */
  readonly creditCents: number;
  readonly planId: PlanId;
  /** Nome do plano contratado. Vazio quando a mensalidade é anterior ao campo. */
  readonly planName: string;
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

  const net = installmentCents(plan);
  const credit = toCents(plan.creditCents);

  return {
    userId: plan.userId,
    status,
    dueDate: plan.dueDate,
    limitDate,
    daysUntilDue,
    daysOverdue: Math.max(0, daysPastLimit),
    openInstallments,
    // O crédito abate o que falta entrar: quem pagou 100 de 150 deve 50, e
    // mostrar 150 em aberto faria o professor cobrar o valor inteiro de novo.
    totalOpenCents: Math.max(0, openInstallments * net - credit),
    amountCents: net,
    grossCents: plan.amountCents,
    discountCents: toCents(plan.discountCents),
    discountReason: plan.discountReason ?? '',
    creditCents: credit,
    planId: plan.planId,
    planName: plan.planName,
    lastPaidAt: plan.lastPaidAt,
  };
}

/**
 * Valor que o aluno paga por parcela: tabela menos desconto, nunca negativo.
 *
 * Um desconto maior que a mensalidade significa isento, e não academia
 * devendo ao aluno.
 */
export function installmentCents(plan: PaymentPlan): number {
  return Math.max(0, Math.trunc(plan.amountCents) - toCents(plan.discountCents));
}

/**
 * Centavos de um campo que pode não existir.
 *
 * Desconto e crédito entraram depois: mensalidade gravada antes deles não tem
 * os campos, e `Math.trunc(undefined)` é `NaN` — que contaminaria toda a
 * conta do mês em silêncio, mostrando "R$ NaN" na tela do professor.
 */
function toCents(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

export interface AppliedPayment {
  /** Quantas parcelas o dinheiro recebido fechou. `0` em pagamento parcial. */
  readonly installmentsPaid: number;
  /** Vencimento depois do pagamento. Igual ao atual quando nada fechou. */
  readonly nextDueDate: string;
  /** Sobra que fica como crédito para a próxima parcela. */
  readonly creditCents: number;
  /** Mês de referência de cada parcela quitada, na ordem. */
  readonly coveredMonths: readonly string[];
}

/**
 * Distribui um valor recebido entre as parcelas em aberto.
 *
 * Resolve de uma vez os três casos que a baixa "tudo ou nada" não cobria:
 *
 *  - **parcial**: recebeu menos que a parcela. Nada vence, o valor fica como
 *    crédito e o professor vê quanto falta;
 *  - **exato**: fecha a parcela e empurra o vencimento, como antes;
 *  - **adiantado**: pagou duas ou três de uma vez. Fecha quantas couberem e
 *    guarda o resto, em vez de dar uma só por paga e perder a diferença.
 *
 * Função pura: não toca em banco, e é onde a conta de dinheiro é testada.
 */
export function applyPayment(plan: PaymentPlan, receivedCents: number): AppliedPayment {
  const parcela = installmentCents(plan);
  const disponivel = toCents(plan.creditCents) + toCents(receivedCents);

  // Parcela zerada (aluno isento) não pode virar laço infinito: o pagamento
  // fecha a parcela corrente e para.
  if (parcela <= 0) {
    return {
      installmentsPaid: 1,
      nextDueDate: addMonths(plan.dueDate, PLAN_MONTHS[plan.planId], plan.dueDay),
      creditCents: 0,
      coveredMonths: [plan.dueDate.slice(0, 7)],
    };
  }

  let restante = disponivel;
  let dueDate = plan.dueDate;
  let fechadas = 0;
  const meses: string[] = [];

  // Teto de 120 pela mesma razão do laço de parcelas em aberto: um valor
  // absurdo digitado por engano não deve travar o servidor.
  while (restante >= parcela && fechadas < 120) {
    meses.push(dueDate.slice(0, 7));
    restante -= parcela;
    dueDate = addMonths(dueDate, PLAN_MONTHS[plan.planId], plan.dueDay);
    fechadas += 1;
  }

  return {
    installmentsPaid: fechadas,
    nextDueDate: dueDate,
    creditCents: restante,
    coveredMonths: meses,
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

/* -------------------------------------------------------------------------- */
/* Reajuste                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Faixa aceita num reajuste, em pontos percentuais.
 *
 * O teto não é desconfiança do professor: é a trava contra o dedo que digita
 * 1500 querendo R$ 15,00. Reajuste de verdade mora entre -10% e +20%, e o
 * limite larga o suficiente para caber uma correção de tabela sem caber um
 * acidente. O piso negativo existe porque reajuste para baixo acontece —
 * promoção de turma vazia, correção de valor errado na matrícula.
 */
export const RAISE_MIN_PERCENT = -50;
export const RAISE_MAX_PERCENT = 100;

/**
 * Valor de tabela depois de um reajuste percentual.
 *
 * Arredonda ao centavo: meio centavo por aluno viraria alguns reais de
 * diferença no fechamento do mês. Mora aqui, e não dentro da action, para a
 * simulação que o professor vê na tela ser **a mesma conta** que o servidor
 * vai gravar — uma prévia que erra por um centavo custa a confiança na tela
 * inteira.
 */
export function raisedCents(amountCents: number, percent: number): number {
  if (!Number.isFinite(amountCents) || !Number.isFinite(percent)) return 0;
  return Math.max(0, Math.round(Math.max(0, amountCents) * (1 + percent / 100)));
}

/**
 * `"5"`, `"5,5"` ou `"-10"` → percentual utilizável, ou `null`.
 *
 * Aceita vírgula porque é o que o teclado brasileiro oferece primeiro, e
 * recusa zero: reajuste de 0% não é reajuste, é clique à toa que ainda assim
 * gravaria uma linha no histórico de cada aluno.
 */
export function parsePercentInput(value: string): number | null {
  const cleaned = value.replace(',', '.').trim();
  if (cleaned.length === 0) return null;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed === 0) return null;
  if (parsed < RAISE_MIN_PERCENT || parsed > RAISE_MAX_PERCENT) return null;

  return parsed;
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

