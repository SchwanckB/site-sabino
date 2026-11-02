import { describe, expect, it } from 'vitest';

import {
  categoryLabel,
  isValidCategory,
  marginPercent,
  summarizeCashbook,
  type CashItem,
} from './cashbook';

const lancamentos: CashItem[] = [
  { kind: 'despesa', date: '2026-03-05', amountCents: 200000, category: 'aluguel' },
  { kind: 'despesa', date: '2026-03-08', amountCents: 38000, category: 'energia' },
  { kind: 'despesa', date: '2026-03-20', amountCents: 12000, category: 'energia' },
  { kind: 'receita', date: '2026-03-10', amountCents: 8000, category: 'matricula' },
  { kind: 'receita', date: '2026-03-12', amountCents: 25000, category: 'kimono' },
  // Fevereiro: não entra no fechamento de março.
  { kind: 'despesa', date: '2026-02-05', amountCents: 200000, category: 'aluguel' },
];

describe('summarizeCashbook', () => {
  const marco = summarizeCashbook(lancamentos, '2026-03', 450000);

  it('soma receitas e despesas do mês, e só do mês', () => {
    expect(marco.expenseCents).toBe(250000);
    expect(marco.incomeCents).toBe(33000);
    expect(marco.entryCount).toBe(5);
  });

  it('junta a mensalidade ao total que entrou', () => {
    expect(marco.tuitionCents).toBe(450000);
    expect(marco.totalInCents).toBe(483000);
  });

  it('calcula o que sobrou — a pergunta que o fechamento não respondia', () => {
    // 4.830 entraram, 2.500 saíram.
    expect(marco.resultCents).toBe(233000);
  });

  it('mostra mês no vermelho como negativo, sem esconder', () => {
    const ruim = summarizeCashbook(lancamentos, '2026-03', 100000);

    expect(ruim.resultCents).toBe(-117000);
    expect(marginPercent(ruim)).toBe(-88);
  });

  it('agrupa despesa por categoria, da maior para a menor', () => {
    expect(marco.byExpenseCategory).toEqual([
      { category: 'aluguel', label: 'Aluguel', cents: 200000 },
      // As duas contas de energia somam na mesma linha.
      { category: 'energia', label: 'Energia', cents: 50000 },
    ]);
  });

  it('agrupa receita avulsa por categoria', () => {
    expect(marco.byIncomeCategory.map((item) => item.category)).toEqual([
      'kimono',
      'matricula',
    ]);
  });

  it('mês sem movimento devolve zeros', () => {
    const vazio = summarizeCashbook(lancamentos, '2026-01', 0);

    expect(vazio.resultCents).toBe(0);
    expect(vazio.entryCount).toBe(0);
    expect(marginPercent(vazio)).toBeNull();
  });

  it('calcula a margem do mês', () => {
    expect(marginPercent(marco)).toBe(48);
  });

  it('não aceita mensalidade negativa', () => {
    // Valor torto na chamada não pode virar receita negativa no fechamento.
    expect(summarizeCashbook([], '2026-03', -5000).tuitionCents).toBe(0);
  });
});

describe('categorias', () => {
  it('traduz a categoria para o rótulo da tela', () => {
    expect(categoryLabel('despesa', 'aluguel')).toBe('Aluguel');
    expect(categoryLabel('receita', 'matricula')).toBe('Taxa de matrícula');
  });

  it('devolve o próprio valor quando a categoria é desconhecida', () => {
    // Lançamento gravado com categoria que saiu da lista continua legível.
    expect(categoryLabel('despesa', 'cafe')).toBe('cafe');
  });

  it('não deixa categoria de receita entrar como despesa', () => {
    expect(isValidCategory('despesa', 'aluguel')).toBe(true);
    expect(isValidCategory('despesa', 'kimono')).toBe(false);
    expect(isValidCategory('receita', 'kimono')).toBe(true);
    expect(isValidCategory('receita', 'aluguel')).toBe(false);
  });

  it('"evento" e "outro" valem nos dois lados', () => {
    expect(isValidCategory('despesa', 'evento')).toBe(true);
    expect(isValidCategory('receita', 'evento')).toBe(true);
    expect(isValidCategory('despesa', 'outro')).toBe(true);
    expect(isValidCategory('receita', 'outro')).toBe(true);
  });
});
