/**
 * Previsão de caixa dos próximos meses — Sabino Academia.
 *
 * O fechamento olha para trás. Esta função olha para frente, e responde a
 * pergunta que o plano trimestral esconde: quem paga três meses de uma vez
 * **não paga nos dois seguintes**, e um mês de boa arrecadação pode ser
 * seguido de dois magros sem que nada esteja errado. Sem a projeção, o
 * professor só descobre o buraco quando ele chega.
 *
 * Função pura, sem I/O. Projeta receita a partir dos planos já cadastrados e
 * despesa a partir das contas fixas — nada é adivinhado: se o dado não está
 * no sistema, não entra na previsão.
 */

import { addMonths } from './datetime';
import { PLAN_MONTHS, type PlanId } from './paymentEngine';

/** O que o motor de previsão precisa saber de uma mensalidade. */
export interface ForecastPlan {
  readonly planId: PlanId;
  /** Valor por parcela já com desconto, em centavos. */
  readonly amountCents: number;
  /** `YYYY-MM-DD` do próximo vencimento em aberto. */
  readonly dueDate: string;
  readonly dueDay: number;
}

/** Uma conta fixa mensal. */
export interface ForecastFixedCost {
  readonly amountCents: number;
}

export interface ForecastMonth {
  /** `YYYY-MM`. */
  readonly month: string;
  /** Mensalidades que vencem no mês. */
  readonly expectedTuitionCents: number;
  /** Quantas parcelas vencem no mês — ajuda a conferir o número. */
  readonly installments: number;
  readonly fixedCostCents: number;
  /** Previsto menos contas fixas. */
  readonly projectedResultCents: number;
}

/** Quantos meses a previsão cobre por padrão. */
export const FORECAST_MONTHS = 6;

/**
 * Projeta os próximos meses a partir dos vencimentos de cada plano.
 *
 * O avanço segue o período do plano, igual ao que acontece na baixa de
 * pagamento: o mensal cai todo mês, o trimestral a cada três, o anual uma vez.
 * Parcela vencida e ainda em aberto é contada no mês em que venceu quando esse
 * mês está na janela — ela é dinheiro que ainda se espera receber.
 */
export function forecastMonths(
  plans: readonly ForecastPlan[],
  fixedCosts: readonly ForecastFixedCost[],
  startMonth: string,
  months: number = FORECAST_MONTHS,
): ForecastMonth[] {
  const janela: string[] = [];
  for (let index = 0; index < Math.max(1, months); index += 1) {
    janela.push(addMonths(`${startMonth}-01`, index).slice(0, 7));
  }

  const receitaPorMes = new Map<string, { cents: number; count: number }>();
  const ultimo = janela[janela.length - 1] ?? startMonth;

  for (const plan of plans) {
    const passo = PLAN_MONTHS[plan.planId];
    let vencimento = plan.dueDate;

    // Teto de segurança: plano com data absurda não pode virar laço infinito.
    for (let guarda = 0; guarda < 240; guarda += 1) {
      const mes = vencimento.slice(0, 7);
      if (mes > ultimo) break;

      if (janela.includes(mes)) {
        const atual = receitaPorMes.get(mes) ?? { cents: 0, count: 0 };
        receitaPorMes.set(mes, {
          cents: atual.cents + Math.max(0, Math.trunc(plan.amountCents)),
          count: atual.count + 1,
        });
      }

      vencimento = addMonths(vencimento, passo, plan.dueDay);
    }
  }

  const fixo = fixedCosts.reduce(
    (soma, item) => soma + Math.max(0, Math.trunc(item.amountCents)),
    0,
  );

  return janela.map((month) => {
    const receita = receitaPorMes.get(month) ?? { cents: 0, count: 0 };
    return {
      month,
      expectedTuitionCents: receita.cents,
      installments: receita.count,
      fixedCostCents: fixo,
      projectedResultCents: receita.cents - fixo,
    };
  });
}
