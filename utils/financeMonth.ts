/**
 * Fechamento financeiro do mês — Sabino Academia.
 *
 * O financeiro respondia bem "como está o aluno X" e não respondia nada sobre
 * o mês: quanto entrou, quanto era esperado, como foi em relação ao mês
 * passado. Essa pergunta — "a academia cresceu?" — não tinha resposta em
 * lugar nenhum do sistema.
 *
 * Funções puras, sem I/O. A regra que vale aqui é **caixa**, não competência:
 * o que conta para o mês é o dia em que o dinheiro entrou (`date`), e não o
 * mês de referência da parcela. É assim que o professor pensa quando olha o
 * mês — quanto entrou de dinheiro em novembro — e é o número que ele compara
 * com o aluguel.
 */

import { addMonths } from './datetime';

/** Um pagamento recebido. `date` é o dia civil em que o dinheiro entrou. */
export interface PaidItem {
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly amountCents: number;
  /** Rótulo da forma de pagamento, já traduzido. */
  readonly method: string;
}

/** Uma mensalidade a receber, do jeito que o motor de cobrança a enxerga. */
export interface ChargeItem {
  /** `YYYY-MM-DD` do vencimento atual. */
  readonly dueDate: string;
  readonly amountCents: number;
}

export interface MethodTotal {
  readonly method: string;
  readonly cents: number;
}

export interface FinanceMonthSummary {
  /** `YYYY-MM`. */
  readonly month: string;
  readonly receivedCents: number;
  readonly paymentsCount: number;
  /** Soma das mensalidades que vencem neste mês. */
  readonly expectedCents: number;
  /** Quanto do previsto já entrou, de 0 a 100. `null` sem previsão. */
  readonly collectedPercent: number | null;
  /** Formas de pagamento do mês, da maior para a menor. */
  readonly byMethod: readonly MethodTotal[];
}

/** `2026-03` → `2026-02`. */
export function previousMonth(month: string): string {
  return addMonths(`${month}-01`, -1).slice(0, 7);
}

export function summarizeFinanceMonth(
  payments: readonly PaidItem[],
  charges: readonly ChargeItem[],
  month: string,
): FinanceMonthSummary {
  const doMes = payments.filter((item) => item.date.slice(0, 7) === month);

  const receivedCents = doMes.reduce((soma, item) => soma + item.amountCents, 0);

  /*
   * Previsto é o que vence **neste** mês, e não a soma de todas as
   * mensalidades: quem está no plano trimestral não deve nada nos dois meses
   * seguintes, e contá-lo todo mês inventaria uma receita que não existe.
   */
  const expectedCents = charges
    .filter((item) => item.dueDate.slice(0, 7) === month)
    .reduce((soma, item) => soma + item.amountCents, 0);

  const porForma = new Map<string, number>();
  for (const item of doMes) {
    const chave = item.method.trim().length > 0 ? item.method : 'Não informado';
    porForma.set(chave, (porForma.get(chave) ?? 0) + item.amountCents);
  }

  return {
    month,
    receivedCents,
    paymentsCount: doMes.length,
    expectedCents,
    collectedPercent:
      expectedCents > 0 ? Math.round((receivedCents / expectedCents) * 100) : null,
    byMethod: [...porForma.entries()]
      .map(([method, cents]) => ({ method, cents }))
      .sort((a, b) => b.cents - a.cents),
  };
}

/**
 * Variação percentual de um mês para o outro, arredondada.
 *
 * `null` quando o mês anterior foi zero: "cresceu infinito por cento" não
 * informa nada, e dividir por zero mentiria com cara de dado.
 */
export function monthOverMonth(currentCents: number, previousCents: number): number | null {
  if (previousCents <= 0) return null;
  return Math.round(((currentCents - previousCents) / previousCents) * 100);
}
