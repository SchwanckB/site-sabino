import { describe, expect, it } from 'vitest';

import {
  ADULT_BELTS,
  BELT_IDS,
  GUARDIAN_REQUIRED_AGE,
  KIDS_BELTS,
  KIDS_BELT_LABELS,
  beltLabel,
  isBelt,
} from './domain';

/**
 * `isBelt` existe por causa de um defeito real: as ações do admin gravavam a
 * faixa conferindo só `length > 0`, então qualquer texto entrava no banco e
 * aparecia na ficha do aluno como se fosse graduação.
 */
describe('isBelt', () => {
  it('aceita toda faixa adulta', () => {
    for (const belt of ADULT_BELTS) expect(isBelt(belt)).toBe(true);
  });

  it('aceita toda faixa infantil, inclusive as variações', () => {
    for (const belt of KIDS_BELTS) expect(isBelt(belt)).toBe(true);
  });

  it('recusa faixa inventada', () => {
    expect(isBelt('faixa roxa com bolinhas')).toBe(false);
    expect(isBelt('coral-com-glitter')).toBe(false);
    expect(isBelt('preta-com-dourado')).toBe(false);
  });

  it('recusa vazio e espaço', () => {
    expect(isBelt('')).toBe(false);
    expect(isBelt('   ')).toBe(false);
  });

  it('é sensível a caixa e acento: o id gravado é exato', () => {
    expect(isBelt('Azul')).toBe(false);
    expect(isBelt('cinza_preta')).toBe(false);
  });

  it('a branca aparece uma só vez, apesar de estar nas duas trilhas', () => {
    expect(BELT_IDS.filter((belt) => belt === 'branca')).toHaveLength(1);
  });

  it('BELT_IDS cobre as duas trilhas', () => {
    for (const belt of [...KIDS_BELTS, ...ADULT_BELTS]) expect(BELT_IDS).toContain(belt);
  });
});

describe('limiar de maioridade', () => {
  it('é a fonte única usada pelo formulário e pela validação', async () => {
    // Eram duas constantes com o mesmo valor, uma usada para mostrar os campos
    // do responsável e outra para exigi-los. Divergindo, o formulário
    // esconderia um campo que o servidor cobra.
    const { GUARDIAN_AGE } = await import('@/utils/onboardingValidation');
    expect(GUARDIAN_AGE).toBe(GUARDIAN_REQUIRED_AGE);
  });
});

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
