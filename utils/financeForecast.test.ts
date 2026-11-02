import { describe, expect, it } from 'vitest';

import { forecastMonths, type ForecastPlan } from './financeForecast';

const mensal = (overrides: Partial<ForecastPlan> = {}): ForecastPlan => ({
  planId: 'mensal',
  amountCents: 15000,
  dueDate: '2026-03-10',
  dueDay: 10,
  ...overrides,
});

describe('forecastMonths', () => {
  it('projeta o mensal caindo todos os meses', () => {
    const meses = forecastMonths([mensal(), mensal()], [], '2026-03', 3);

    expect(meses.map((m) => m.month)).toEqual(['2026-03', '2026-04', '2026-05']);
    expect(meses.map((m) => m.expectedTuitionCents)).toEqual([30000, 30000, 30000]);
    expect(meses[0]?.installments).toBe(2);
  });

  it('mostra o buraco que o trimestral deixa nos dois meses seguintes', () => {
    // É o caso que a previsão existe para enxergar: entra bem em março e
    // nada em abril e maio, sem que haja nada de errado.
    const meses = forecastMonths(
      [mensal({ planId: 'trimestral', amountCents: 40000 })],
      [],
      '2026-03',
      4,
    );

    expect(meses.map((m) => m.expectedTuitionCents)).toEqual([40000, 0, 0, 40000]);
  });

  it('o anual aparece uma vez e desaparece da janela', () => {
    const meses = forecastMonths(
      [mensal({ planId: 'anual', amountCents: 150000 })],
      [],
      '2026-03',
      6,
    );

    expect(meses[0]?.expectedTuitionCents).toBe(150000);
    expect(meses.slice(1).every((m) => m.expectedTuitionCents === 0)).toBe(true);
  });

  it('desconta as contas fixas de cada mês', () => {
    const meses = forecastMonths(
      [mensal()],
      [{ amountCents: 200000 }, { amountCents: 38000 }],
      '2026-03',
      2,
    );

    expect(meses[0]?.fixedCostCents).toBe(238000);
    // 150 de receita contra 2.380 de conta fixa: previsão no vermelho.
    expect(meses[0]?.projectedResultCents).toBe(-223000);
  });

  it('conta a parcela vencida no mês em que venceu', () => {
    // Parcela de fevereiro ainda em aberto, janela começando em fevereiro.
    const meses = forecastMonths([mensal({ dueDate: '2026-02-10' })], [], '2026-02', 2);

    expect(meses[0]?.expectedTuitionCents).toBe(15000);
    expect(meses[1]?.expectedTuitionCents).toBe(15000);
  });

  it('ignora parcela cujo vencimento é anterior à janela', () => {
    const meses = forecastMonths([mensal({ dueDate: '2025-01-10' })], [], '2026-03', 2);

    // O laço avança mês a mês até alcançar a janela; nada se perde no caminho.
    expect(meses[0]?.expectedTuitionCents).toBe(15000);
  });

  it('atravessa a virada do ano', () => {
    const meses = forecastMonths([mensal({ dueDate: '2026-12-10' })], [], '2026-12', 3);

    expect(meses.map((m) => m.month)).toEqual(['2026-12', '2027-01', '2027-02']);
    expect(meses.every((m) => m.expectedTuitionCents === 15000)).toBe(true);
  });

  it('sem plano nenhum, projeta só o custo fixo', () => {
    const meses = forecastMonths([], [{ amountCents: 100000 }], '2026-03', 2);

    expect(meses[0]?.expectedTuitionCents).toBe(0);
    expect(meses[0]?.projectedResultCents).toBe(-100000);
  });

  it('sempre devolve pelo menos um mês', () => {
    expect(forecastMonths([], [], '2026-03', 0)).toHaveLength(1);
  });
});
