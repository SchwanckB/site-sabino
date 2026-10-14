import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GRACE_DAYS,
  DUE_SOON_DAYS,
  advanceDueDate,
  firstDueDate,
  formatCents,
  getPaymentSummary,
  normalizeDueDay,
  parseCentsInput,
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
