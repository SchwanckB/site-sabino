import { describe, expect, it } from 'vitest';

import { ADULT_BELTS, KIDS_BELTS, KIDS_BELT_LABELS, beltLabel } from './domain';

describe('faixas infantis', () => {
  it('tem as três variações de cinza, amarela, laranja e verde', () => {
    for (const cor of ['cinza', 'amarela', 'laranja', 'verde']) {
      expect(KIDS_BELTS).toContain(`${cor}-branca`);
      expect(KIDS_BELTS).toContain(cor);
      expect(KIDS_BELTS).toContain(`${cor}-preta`);
    }
  });

  it('começa na branca e termina na verde e preta', () => {
    expect(KIDS_BELTS[0]).toBe('branca');
    expect(KIDS_BELTS[KIDS_BELTS.length - 1]).toBe('verde-preta');
  });

  it('a variação com branco vem antes da lisa, e a lisa antes da com preto', () => {
    const pos = (belt: string) => KIDS_BELTS.indexOf(belt as never);

    for (const cor of ['cinza', 'amarela', 'laranja', 'verde']) {
      expect(pos(`${cor}-branca`)).toBeLessThan(pos(cor));
      expect(pos(cor)).toBeLessThan(pos(`${cor}-preta`));
    }
  });

  it('as cores seguem a ordem cinza, amarela, laranja, verde', () => {
    const pos = (belt: string) => KIDS_BELTS.indexOf(belt as never);

    expect(pos('cinza-branca')).toBeLessThan(pos('amarela-branca'));
    expect(pos('amarela-preta')).toBeLessThan(pos('laranja-branca'));
    expect(pos('laranja-preta')).toBeLessThan(pos('verde-branca'));
  });

  it('toda faixa tem rótulo', () => {
    for (const belt of KIDS_BELTS) {
      expect(KIDS_BELT_LABELS[belt].length).toBeGreaterThan(0);
    }
  });

  it('as fichas antigas continuam válidas', () => {
    // Cadastro feito antes das variações gravou `cinza`, `amarela` etc.
    for (const antigo of ['branca', 'cinza', 'amarela', 'laranja', 'verde']) {
      expect(KIDS_BELTS).toContain(antigo);
    }
  });
});

describe('beltLabel', () => {
  it('traduz as variações infantis', () => {
    expect(beltLabel('cinza-branca')).toBe('Cinza e branca');
    expect(beltLabel('verde-preta')).toBe('Verde e preta');
  });

  it('capitaliza as faixas adultas', () => {
    for (const belt of ADULT_BELTS) {
      expect(beltLabel(belt)).toBe(belt.charAt(0).toUpperCase() + belt.slice(1));
    }
  });

  it('não quebra com faixa desconhecida', () => {
    expect(beltLabel('coral')).toBe('Coral');
    expect(beltLabel('')).toBe('');
  });
});
