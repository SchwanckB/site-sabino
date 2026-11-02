import { describe, expect, it } from 'vitest';

import {
  monthOverMonth,
  previousMonth,
  summarizeFinanceMonth,
  type ChargeItem,
  type PaidItem,
} from './financeMonth';

const pagamentos: PaidItem[] = [
  { date: '2026-03-05', amountCents: 15000, method: 'Pix' },
  { date: '2026-03-09', amountCents: 15000, method: 'Pix' },
  { date: '2026-03-12', amountCents: 20000, method: 'Dinheiro' },
  // Fevereiro: entra na comparação, não no mês corrente.
  { date: '2026-02-08', amountCents: 15000, method: 'Pix' },
  { date: '2026-02-20', amountCents: 10000, method: 'Cartão' },
];

const cobrancas: ChargeItem[] = [
  { dueDate: '2026-03-10', amountCents: 15000 },
  { dueDate: '2026-03-10', amountCents: 15000 },
  { dueDate: '2026-03-15', amountCents: 20000 },
  // Trimestral que só vence em maio: não é receita prevista de março.
  { dueDate: '2026-05-10', amountCents: 40000 },
];

describe('summarizeFinanceMonth', () => {
  const marco = summarizeFinanceMonth(pagamentos, cobrancas, '2026-03');

  it('soma o que entrou no mês, pelo dia do pagamento', () => {
    expect(marco.receivedCents).toBe(50000);
    expect(marco.paymentsCount).toBe(3);
  });

  it('prevê só o que vence no mês', () => {
    // 150 + 150 + 200 = 500. O trimestral de maio fica fora.
    expect(marco.expectedCents).toBe(50000);
  });

  it('calcula quanto do previsto já entrou', () => {
    expect(marco.collectedPercent).toBe(100);

    const parcial = summarizeFinanceMonth(
      [{ date: '2026-03-05', amountCents: 25000, method: 'Pix' }],
      cobrancas,
      '2026-03',
    );
    expect(parcial.collectedPercent).toBe(50);
  });

  it('não inventa percentual sem previsão', () => {
    const semPrevisao = summarizeFinanceMonth(pagamentos, [], '2026-03');
    expect(semPrevisao.collectedPercent).toBeNull();
  });

  it('agrupa por forma de pagamento, da maior para a menor', () => {
    expect(marco.byMethod).toEqual([
      { method: 'Pix', cents: 30000 },
      { method: 'Dinheiro', cents: 20000 },
    ]);
  });

  it('não perde pagamento sem forma informada', () => {
    const resumo = summarizeFinanceMonth(
      [{ date: '2026-03-01', amountCents: 5000, method: '' }],
      [],
      '2026-03',
    );

    expect(resumo.receivedCents).toBe(5000);
    expect(resumo.byMethod).toEqual([{ method: 'Não informado', cents: 5000 }]);
  });

  it('mês sem movimento devolve zeros, e não erro', () => {
    const vazio = summarizeFinanceMonth(pagamentos, cobrancas, '2026-01');

    expect(vazio.receivedCents).toBe(0);
    expect(vazio.paymentsCount).toBe(0);
    expect(vazio.byMethod).toEqual([]);
  });
});

describe('previousMonth', () => {
  it('volta um mês', () => {
    expect(previousMonth('2026-03')).toBe('2026-02');
  });

  it('atravessa a virada do ano', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
  });
});

describe('monthOverMonth', () => {
  it('calcula crescimento e queda', () => {
    expect(monthOverMonth(50000, 25000)).toBe(100);
    expect(monthOverMonth(25000, 50000)).toBe(-50);
    expect(monthOverMonth(30000, 30000)).toBe(0);
  });

  it('não compara com mês vazio', () => {
    // "cresceu infinito por cento" não é informação.
    expect(monthOverMonth(50000, 0)).toBeNull();
  });
});
