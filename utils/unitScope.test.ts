import { describe, expect, it } from 'vitest';

import {
  DEFAULT_UNIT,
  UNITS,
  filterByUnit,
  isUnitId,
  matchesUnit,
  toUnitId,
  toUnitScope,
  type UnitId,
} from '@/types/domain';

/** Lista mínima com unidade, como alunos e turmas carregam. */
const itens: readonly { id: string; unit: UnitId }[] = [
  { id: 'a', unit: 'tres-cachoeiras' },
  { id: 'b', unit: 'terra-de-areia' },
  { id: 'c', unit: 'tres-cachoeiras' },
];

describe('toUnitId', () => {
  it('aceita as unidades conhecidas', () => {
    expect(toUnitId('terra-de-areia')).toBe('terra-de-areia');
    expect(toUnitId('tres-cachoeiras')).toBe('tres-cachoeiras');
  });

  it('cai na unidade padrão com qualquer outra coisa', () => {
    // Cadastro anterior à segunda academia não tem o campo gravado.
    expect(toUnitId(undefined)).toBe(DEFAULT_UNIT);
    expect(toUnitId('')).toBe(DEFAULT_UNIT);
    expect(toUnitId(null)).toBe(DEFAULT_UNIT);
    expect(toUnitId('porto-alegre')).toBe(DEFAULT_UNIT);
    expect(toUnitId(42)).toBe(DEFAULT_UNIT);
  });

  it('a unidade padrão é uma das cadastradas', () => {
    expect(isUnitId(DEFAULT_UNIT)).toBe(true);
    expect(UNITS).toContain(DEFAULT_UNIT);
  });
});

describe('toUnitScope', () => {
  it('aceita as unidades e o recorte geral', () => {
    expect(toUnitScope('todas')).toBe('todas');
    expect(toUnitScope('terra-de-areia')).toBe('terra-de-areia');
  });

  it('sem cookie, mostra a rede inteira', () => {
    // Melhor ver demais do que esconder alunos sem avisar.
    expect(toUnitScope(undefined)).toBe('todas');
    expect(toUnitScope('inexistente')).toBe('todas');
  });
});

describe('matchesUnit', () => {
  it('o recorte geral aceita qualquer unidade', () => {
    for (const unit of UNITS) {
      expect(matchesUnit('todas', unit)).toBe(true);
    }
  });

  it('o recorte específico só aceita a própria', () => {
    expect(matchesUnit('terra-de-areia', 'terra-de-areia')).toBe(true);
    expect(matchesUnit('terra-de-areia', 'tres-cachoeiras')).toBe(false);
  });
});

describe('filterByUnit', () => {
  it('devolve tudo no recorte geral', () => {
    expect(filterByUnit(itens, 'todas')).toHaveLength(3);
  });

  it('recorta pela unidade pedida', () => {
    expect(filterByUnit(itens, 'tres-cachoeiras').map((i) => i.id)).toEqual(['a', 'c']);
    expect(filterByUnit(itens, 'terra-de-areia').map((i) => i.id)).toEqual(['b']);
  });

  it('não devolve a mesma referência da lista original', () => {
    // As telas ordenam o resultado; mutar a lista de origem seria efeito oculto.
    const todas = filterByUnit(itens, 'todas');
    expect(todas).not.toBe(itens);
    todas.sort((a, b) => b.id.localeCompare(a.id));
    expect(itens.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('aguenta lista vazia', () => {
    expect(filterByUnit([], 'tres-cachoeiras')).toEqual([]);
  });
});
