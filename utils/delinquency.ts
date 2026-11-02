/**
 * Leitura da inadimplência — Sabino Academia.
 *
 * O financeiro dizia quem está vencido **hoje**. Não dizia se o aluno atrasa
 * sempre ou atrasou uma vez, quantos dias costuma atrasar, nem se a cobrança
 * que o professor manda serve para alguma coisa. São três perguntas
 * diferentes, e nenhuma se responde olhando a lista do dia.
 *
 * Funções puras. O atraso sai do histórico de pagamentos: cada baixa guarda o
 * vencimento da parcela que quitou, então a diferença entre pagar e vencer é
 * um dado, e não uma estimativa.
 */

import { daysBetween } from './datetime';

/** Um pagamento já registrado, do ponto de vista do atraso. */
export interface PaidInstallment {
  /** `YYYY-MM-DD` em que o dinheiro entrou. */
  readonly paidOn: string;
  /**
   * `YYYY-MM-DD` do vencimento da parcela quitada.
   *
   * Vazio nos pagamentos gravados antes deste campo existir — esses ficam
   * fora da conta em vez de entrarem com atraso zero, que puxaria a média
   * para baixo e faria a academia parecer mais pontual do que é.
   */
  readonly dueDate: string;
}

export interface StudentDelinquency {
  readonly userId: string;
  /** Pagamentos com vencimento conhecido — a base da média. */
  readonly measured: number;
  /** Quantos foram pagos depois do vencimento. */
  readonly lateCount: number;
  /** Média de dias de atraso, contando só os atrasados. `null` sem atraso. */
  readonly averageDelayDays: number | null;
  /** Maior atraso registrado, em dias. */
  readonly worstDelayDays: number;
  /** `true` quando atrasa na maioria das vezes — e não só uma vez. */
  readonly chronic: boolean;
}

/** Quantos pagamentos medidos já permitem falar de hábito. */
export const CHRONIC_MIN_PAYMENTS = 3;

/** Dos pagamentos medidos, quanto precisa estar atrasado para virar hábito. */
export const CHRONIC_RATIO = 0.5;

/**
 * Perfil de pontualidade de um aluno.
 *
 * "Crônico" exige histórico: quem pagou duas vezes e atrasou uma não é mau
 * pagador, é alguém que atrasou uma vez. Sem esse piso, todo aluno novo que
 * esquecesse o primeiro boleto entraria na lista de problema.
 */
export function studentDelinquency(
  userId: string,
  payments: readonly PaidInstallment[],
): StudentDelinquency {
  const medidos = payments.filter(
    (item) => item.dueDate.length > 0 && item.paidOn.length > 0,
  );

  const atrasos = medidos
    .map((item) => daysBetween(item.paidOn, item.dueDate))
    .filter((dias) => dias > 0);

  const soma = atrasos.reduce((total, dias) => total + dias, 0);

  return {
    userId,
    measured: medidos.length,
    lateCount: atrasos.length,
    averageDelayDays: atrasos.length > 0 ? Math.round(soma / atrasos.length) : null,
    worstDelayDays: atrasos.length > 0 ? Math.max(...atrasos) : 0,
    chronic:
      medidos.length >= CHRONIC_MIN_PAYMENTS &&
      atrasos.length / medidos.length >= CHRONIC_RATIO,
  };
}

export interface DelinquencyOverview {
  /** Média de atraso da academia, só entre os pagamentos atrasados. */
  readonly averageDelayDays: number | null;
  /** Proporção de pagamentos feitos em dia, de 0 a 100. */
  readonly onTimePercent: number | null;
  readonly chronicUserIds: readonly string[];
  readonly measuredPayments: number;
}

export function delinquencyOverview(
  perfis: readonly StudentDelinquency[],
): DelinquencyOverview {
  const medidos = perfis.reduce((soma, p) => soma + p.measured, 0);
  const atrasados = perfis.reduce((soma, p) => soma + p.lateCount, 0);

  // Média ponderada pelos atrasos de cada aluno, e não média das médias: um
  // aluno com um atraso de 30 dias não deve pesar igual a outro com dez.
  const somaDias = perfis.reduce(
    (soma, p) => soma + (p.averageDelayDays ?? 0) * p.lateCount,
    0,
  );

  return {
    averageDelayDays: atrasados > 0 ? Math.round(somaDias / atrasados) : null,
    onTimePercent: medidos > 0 ? Math.round(((medidos - atrasados) / medidos) * 100) : null,
    chronicUserIds: perfis.filter((p) => p.chronic).map((p) => p.userId),
    measuredPayments: medidos,
  };
}

/** Dias dentro dos quais um pagamento conta como resposta à cobrança. */
export const RECOVERY_WINDOW_DAYS = 7;

export interface RecoveryInput {
  readonly userId: string;
  /** `YYYY-MM-DD` da cobrança enviada, ou `undefined` se não houve. */
  readonly chargedOn: string | undefined;
  /** `YYYY-MM-DD` do último pagamento, ou `undefined`. */
  readonly lastPaidOn: string | undefined;
}

export interface RecoveryReport {
  readonly charged: number;
  /** Pagaram até uma semana depois da cobrança. */
  readonly recovered: number;
  /** Proporção de 0 a 100. `null` quando ninguém foi cobrado. */
  readonly recoveryPercent: number | null;
}

/**
 * A cobrança funciona?
 *
 * Mede quantos dos cobrados pagaram na semana seguinte. Não é prova de causa
 * — alguns pagariam de todo modo — mas é a única leitura honesta disponível, e
 * responde se vale a pena manter a rotina de cobrar.
 */
export function recoveryReport(rows: readonly RecoveryInput[]): RecoveryReport {
  const cobrados = rows.filter((row) => row.chargedOn !== undefined);

  const recuperados = cobrados.filter((row) => {
    if (row.lastPaidOn === undefined || row.chargedOn === undefined) return false;
    const dias = daysBetween(row.lastPaidOn, row.chargedOn);
    return dias >= 0 && dias <= RECOVERY_WINDOW_DAYS;
  });

  return {
    charged: cobrados.length,
    recovered: recuperados.length,
    recoveryPercent:
      cobrados.length > 0
        ? Math.round((recuperados.length / cobrados.length) * 100)
        : null,
  };
}
