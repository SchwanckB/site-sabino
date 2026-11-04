import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GRACE_DAYS,
  DUE_SOON_DAYS,
  RAISE_MAX_PERCENT,
  RAISE_MIN_PERCENT,
  advanceDueDate,
  applyPayment,
  firstDueDate,
  formatCents,
  getPaymentSummary,
  normalizeDueDay,
  parseCentsInput,
  parsePercentInput,
  raisedCents,
  referenceMonth,
  rollbackDueDate,
  type PaymentPlan,
} from './paymentEngine';

/** Meio-dia em São Paulo (UTC-3, sem horário de verão desde 2019). */
const spNoon = (isoDate: string): Date => new Date(`${isoDate}T12:00:00-03:00`);

/** Cenário do enunciado: vence dia 11, tolerância até o dia 15. */
const plan = (overrides: Partial<PaymentPlan> = {}): PaymentPlan => ({
  userId: 'aluno-joao',
  planId: 'mensal',
  planName: '',
  amountCents: 15000,
  dueDay: 11,
  graceDays: 4,
  dueDate: '2026-03-11',
  lastPaidAt: null,
  ...overrides,
});

describe('normalizeDueDay', () => {
  it('mantém dias válidos e limita o resto', () => {
    expect(normalizeDueDay(11)).toBe(11);
    expect(normalizeDueDay(1)).toBe(1);
    expect(normalizeDueDay(31)).toBe(31);
    expect(normalizeDueDay(0)).toBe(1);
    expect(normalizeDueDay(45)).toBe(31);
    expect(normalizeDueDay(Number.NaN)).toBe(1);
  });
});

describe('firstDueDate', () => {
  it('cobra ainda neste mês quando o dia combinado não passou', () => {
    expect(firstDueDate(spNoon('2026-03-03'), 11)).toBe('2026-03-11');
  });

  it('cobra no mesmo dia quando a aprovação cai no vencimento', () => {
    expect(firstDueDate(spNoon('2026-03-11'), 11)).toBe('2026-03-11');
  });

  it('empurra para o mês seguinte quando o dia já passou', () => {
    expect(firstDueDate(spNoon('2026-03-20'), 11)).toBe('2026-04-11');
  });

  it('prende o dia 31 ao último dia dos meses curtos', () => {
    expect(firstDueDate(spNoon('2026-02-01'), 31)).toBe('2026-02-28');
    expect(firstDueDate(spNoon('2024-02-01'), 31)).toBe('2024-02-29');
    expect(firstDueDate(spNoon('2026-04-01'), 31)).toBe('2026-04-30');
  });
});

describe('getPaymentSummary - semáforo', () => {
  it('fica verde bem antes do vencimento', () => {
    const summary = getPaymentSummary(plan(), spNoon('2026-03-01'));

    expect(summary.status).toBe('em_dia');
    expect(summary.daysUntilDue).toBe(10);
    expect(summary.daysOverdue).toBe(0);
    expect(summary.openInstallments).toBe(1);
  });

  it('fica amarelo a 5 dias do vencimento', () => {
    const cincoDias = getPaymentSummary(plan(), spNoon('2026-03-06'));
    expect(cincoDias.daysUntilDue).toBe(DUE_SOON_DAYS);
    expect(cincoDias.status).toBe('vence_em_breve');

    const seisDias = getPaymentSummary(plan(), spNoon('2026-03-05'));
    expect(seisDias.daysUntilDue).toBe(6);
    expect(seisDias.status).toBe('em_dia');
  });

  it('continua amarelo no dia do vencimento e durante a tolerância', () => {
    expect(getPaymentSummary(plan(), spNoon('2026-03-11')).status).toBe('vence_em_breve');
    expect(getPaymentSummary(plan(), spNoon('2026-03-15')).status).toBe('vence_em_breve');
  });

  it('vira vermelho no primeiro dia depois da tolerância', () => {
    const summary = getPaymentSummary(plan(), spNoon('2026-03-16'));

    expect(summary.status).toBe('vencida');
    expect(summary.limitDate).toBe('2026-03-15');
    expect(summary.daysOverdue).toBe(1);
  });

  it('respeita tolerância zero', () => {
    const semTolerancia = plan({ graceDays: 0 });

    expect(getPaymentSummary(semTolerancia, spNoon('2026-03-11')).status).toBe('vence_em_breve');
    expect(getPaymentSummary(semTolerancia, spNoon('2026-03-12')).status).toBe('vencida');
  });
});

describe('getPaymentSummary - parcelas em aberto', () => {
  it('conta uma parcela enquanto o mês está em dia', () => {
    const summary = getPaymentSummary(plan(), spNoon('2026-03-12'));

    expect(summary.openInstallments).toBe(1);
    expect(summary.totalOpenCents).toBe(15000);
  });

  it('acumula uma parcela por mês não pago', () => {
    const doisMeses = getPaymentSummary(plan(), spNoon('2026-04-12'));
    expect(doisMeses.openInstallments).toBe(2);
    expect(doisMeses.totalOpenCents).toBe(30000);

    const quatroMeses = getPaymentSummary(plan(), spNoon('2026-06-20'));
    expect(quatroMeses.openInstallments).toBe(4);
    expect(quatroMeses.totalOpenCents).toBe(60000);
  });

  it('só conta a parcela seguinte depois que ela vence', () => {
    // 10 de abril: a de abril ainda não venceu, então seguem 1 em aberto.
    expect(getPaymentSummary(plan(), spNoon('2026-04-10')).openInstallments).toBe(1);
    expect(getPaymentSummary(plan(), spNoon('2026-04-11')).openInstallments).toBe(2);
  });

  it('atravessa a virada de ano', () => {
    const summary = getPaymentSummary(
      plan({ dueDate: '2025-11-11' }),
      spNoon('2026-02-11'),
    );

    expect(summary.openInstallments).toBe(4);
    expect(summary.status).toBe('vencida');
  });
});

describe('advanceDueDate / rollbackDueDate', () => {
  it('avança um mês no plano mensal', () => {
    expect(advanceDueDate(plan())).toBe('2026-04-11');
  });

  it('avança três meses no trimestral e doze no anual', () => {
    expect(advanceDueDate(plan({ planId: 'trimestral' }))).toBe('2026-06-11');
    expect(advanceDueDate(plan({ planId: 'anual' }))).toBe('2027-03-11');
  });

  it('é reversível - desfazer volta ao vencimento anterior', () => {
    const atual = plan();
    const avancado = plan({ dueDate: advanceDueDate(atual) });

    expect(rollbackDueDate(avancado)).toBe(atual.dueDate);
  });

  it('recupera o dia 31 depois de passar por um mês curto', () => {
    const jan = plan({ dueDay: 31, dueDate: '2026-01-31' });
    const fev = advanceDueDate(jan);
    expect(fev).toBe('2026-02-28');

    // O dia preferido continua sendo 31, então março volta para o dia 31.
    expect(advanceDueDate(plan({ dueDay: 31, dueDate: fev }))).toBe('2026-03-31');
  });
});

describe('referenceMonth', () => {
  it('usa o mês da parcela em aberto mais antiga', () => {
    expect(referenceMonth(plan())).toBe('2026-03');
    expect(referenceMonth(plan({ dueDate: '2025-12-11' }))).toBe('2025-12');
  });
});

describe('formatCents / parseCentsInput', () => {
  it('formata em reais', () => {
    expect(formatCents(15000).replace(/ /g, ' ')).toBe('R$ 150,00');
    expect(formatCents(0).replace(/ /g, ' ')).toBe('R$ 0,00');
    expect(formatCents(999).replace(/ /g, ' ')).toBe('R$ 9,99');
  });

  it('lê o que o admin digita', () => {
    expect(parseCentsInput('150')).toBe(15000);
    expect(parseCentsInput('150,00')).toBe(15000);
    expect(parseCentsInput('150.00')).toBe(15000);
    expect(parseCentsInput('R$ 150,50')).toBe(15050);
    expect(parseCentsInput('1.250,90')).toBe(125090);
    expect(parseCentsInput('0')).toBe(0);
  });

  it('rejeita entrada inválida', () => {
    expect(parseCentsInput('')).toBeNull();
    expect(parseCentsInput('abc')).toBeNull();
    expect(parseCentsInput('-50')).toBeNull();
  });
});

describe('constantes', () => {
  it('mantém os padrões documentados', () => {
    expect(DUE_SOON_DAYS).toBe(5);
    expect(DEFAULT_GRACE_DAYS).toBe(4);
  });
});


/**
 * Desconto, crédito e pagamento parcial.
 *
 * A baixa era tudo ou nada: o aluno que entregava parte do valor deixava o
 * professor escolher entre dar a parcela por paga — perdendo a diferença — ou
 * não registrar nada. E o desconto de bolsa ou de irmão vivia numa observação
 * em texto, fora da conta do mês.
 */
describe('desconto na mensalidade', () => {
  const comDesconto = plan({
    amountCents: 15000,
    discountCents: 3000,
    discountReason: 'irmão de aluno',
  });

  it('cobra o valor com desconto, e guarda o de tabela', () => {
    const resumo = getPaymentSummary(comDesconto, spNoon('2026-03-05'));

    expect(resumo.amountCents).toBe(12000);
    expect(resumo.grossCents).toBe(15000);
    expect(resumo.discountCents).toBe(3000);
    expect(resumo.discountReason).toBe('irmão de aluno');
  });

  it('desconto maior que a mensalidade significa isento, não crédito', () => {
    const isento = plan({ amountCents: 15000, discountCents: 20000 });

    expect(getPaymentSummary(isento, spNoon('2026-03-05')).amountCents).toBe(0);
  });

  it('mensalidade antiga, sem os campos novos, continua valendo', () => {
    // Plano gravado antes do desconto existir: sem tratamento, `undefined`
    // viraria NaN e a tela mostraria "R$ NaN".
    const resumo = getPaymentSummary(plan({ amountCents: 15000 }), spNoon('2026-03-05'));

    expect(resumo.amountCents).toBe(15000);
    expect(resumo.discountCents).toBe(0);
    expect(resumo.creditCents).toBe(0);
    expect(Number.isNaN(resumo.totalOpenCents)).toBe(false);
  });

  it('o crédito abate o que falta entrar', () => {
    const parcial = plan({ amountCents: 15000, creditCents: 10000 });
    const resumo = getPaymentSummary(parcial, spNoon('2026-03-05'));

    // Pagou 100 de 150: deve 50, e não 150.
    expect(resumo.totalOpenCents).toBe(5000);
    expect(resumo.creditCents).toBe(10000);
  });
});

describe('applyPayment', () => {
  const base = plan({ amountCents: 15000, dueDate: '2026-03-10', dueDay: 10 });

  it('pagamento exato fecha a parcela e empurra o vencimento', () => {
    const r = applyPayment(base, 15000);

    expect(r.installmentsPaid).toBe(1);
    expect(r.nextDueDate).toBe('2026-04-10');
    expect(r.creditCents).toBe(0);
    expect(r.coveredMonths).toEqual(['2026-03']);
  });

  it('pagamento parcial não vence nada e fica como crédito', () => {
    const r = applyPayment(base, 10000);

    expect(r.installmentsPaid).toBe(0);
    expect(r.nextDueDate).toBe('2026-03-10');
    expect(r.creditCents).toBe(10000);
    expect(r.coveredMonths).toEqual([]);
  });

  it('o crédito soma com o pagamento seguinte e fecha a parcela', () => {
    const r = applyPayment(plan({ ...base, creditCents: 10000 }), 5000);

    expect(r.installmentsPaid).toBe(1);
    expect(r.nextDueDate).toBe('2026-04-10');
    expect(r.creditCents).toBe(0);
  });

  it('pagamento adiantado fecha várias parcelas de uma vez', () => {
    const r = applyPayment(base, 45000);

    expect(r.installmentsPaid).toBe(3);
    expect(r.nextDueDate).toBe('2026-06-10');
    expect(r.coveredMonths).toEqual(['2026-03', '2026-04', '2026-05']);
    expect(r.creditCents).toBe(0);
  });

  it('o troco de um adiantamento vira crédito, em vez de se perder', () => {
    const r = applyPayment(base, 40000);

    expect(r.installmentsPaid).toBe(2);
    expect(r.creditCents).toBe(10000);
  });

  it('respeita o desconto ao distribuir o valor', () => {
    // Parcela de 100 depois da bolsa: 200 fecham duas.
    const r = applyPayment(plan({ ...base, discountCents: 5000 }), 20000);

    expect(r.installmentsPaid).toBe(2);
    expect(r.creditCents).toBe(0);
  });

  it('plano trimestral avança três meses por parcela', () => {
    const r = applyPayment(plan({ ...base, planId: 'trimestral' }), 15000);

    expect(r.installmentsPaid).toBe(1);
    expect(r.nextDueDate).toBe('2026-06-10');
  });

  it('aluno isento fecha a parcela sem dinheiro, e não trava', () => {
    const r = applyPayment(plan({ ...base, discountCents: 15000 }), 0);

    expect(r.installmentsPaid).toBe(1);
    expect(r.nextDueDate).toBe('2026-04-10');
  });

  it('valor negativo digitado por engano não vira crédito', () => {
    const r = applyPayment(base, -5000);

    expect(r.installmentsPaid).toBe(0);
    expect(r.creditCents).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Reajuste em lote                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `raisedCents` e `parsePercentInput` são usados nos dois lados: a tela de
 * reajuste simula com eles, e `bulkRaiseAction` grava com eles. É essa
 * partilha que garante que a prévia na tela seja a conta que o servidor faz —
 * uma simulação que erra por um centavo custa a confiança na tela inteira.
 */
describe('raisedCents', () => {
  it('aplica o percentual sobre o valor de tabela', () => {
    expect(raisedCents(15000, 10)).toBe(16500);
    expect(raisedCents(15000, 8)).toBe(16200);
  });

  it('percentual negativo reduz', () => {
    expect(raisedCents(20000, -25)).toBe(15000);
  });

  it('arredonda ao centavo, para cima e para baixo', () => {
    // 13333 * 1.075 = 14332,975
    expect(raisedCents(13333, 7.5)).toBe(14333);
    // 10001 * 1.004 = 10041,004
    expect(raisedCents(10001, 0.4)).toBe(10041);
  });

  it('nunca devolve valor negativo', () => {
    expect(raisedCents(10000, -200)).toBe(0);
    expect(raisedCents(-5000, 10)).toBe(0);
  });

  it('valor quebrado não vira NaN no fechamento do mês', () => {
    expect(raisedCents(Number.NaN, 10)).toBe(0);
    expect(raisedCents(15000, Number.NaN)).toBe(0);
  });
});

describe('parsePercentInput', () => {
  it('aceita ponto e vírgula, porque o teclado brasileiro oferece a vírgula', () => {
    expect(parsePercentInput('7,5')).toBe(7.5);
    expect(parsePercentInput('7.5')).toBe(7.5);
    expect(parsePercentInput(' 10 ')).toBe(10);
  });

  it('aceita redução', () => {
    expect(parsePercentInput('-10')).toBe(-10);
  });

  /*
   * Zero não é reajuste: é clique à toa que ainda assim gravaria uma linha no
   * histórico de valor de cada aluno marcado.
   */
  it('recusa zero', () => {
    expect(parsePercentInput('0')).toBeNull();
    expect(parsePercentInput('0,0')).toBeNull();
  });

  it('recusa fora da faixa — a trava contra digitar 1500 querendo R$ 15,00', () => {
    expect(parsePercentInput('1500')).toBeNull();
    expect(parsePercentInput(String(RAISE_MAX_PERCENT + 1))).toBeNull();
    expect(parsePercentInput(String(RAISE_MIN_PERCENT - 1))).toBeNull();
  });

  it('aceita exatamente os limites', () => {
    expect(parsePercentInput(String(RAISE_MAX_PERCENT))).toBe(RAISE_MAX_PERCENT);
    expect(parsePercentInput(String(RAISE_MIN_PERCENT))).toBe(RAISE_MIN_PERCENT);
  });

  it('recusa vazio e texto', () => {
    expect(parsePercentInput('')).toBeNull();
    expect(parsePercentInput('   ')).toBeNull();
    expect(parsePercentInput('oito por cento')).toBeNull();
  });
});
