import { describe, expect, it } from 'vitest';

import { buildHaystack, normalizeSearch } from './searchText';

describe('normalizeSearch', () => {
  it('tira acento e caixa', () => {
    expect(normalizeSearch('João Vitor')).toBe('joao vitor');
    expect(normalizeSearch('ANA CLARA')).toBe('ana clara');
    expect(normalizeSearch('Otávio Brum')).toBe('otavio brum');
  });

  it('aguenta ç e til', () => {
    expect(normalizeSearch('Conceição')).toBe('conceicao');
    expect(normalizeSearch('Simão')).toBe('simao');
  });

  it('tira espaço das pontas', () => {
    expect(normalizeSearch('  Bruno  ')).toBe('bruno');
  });

  it('não quebra com vazio', () => {
    expect(normalizeSearch('')).toBe('');
  });
});

describe('buildHaystack', () => {
  it('junta os campos buscáveis já normalizados', () => {
    const texto = buildHaystack(['João Vitor', '51999998888', null, 'joao@exemplo.com']);

    expect(texto).toContain('joao vitor');
    expect(texto).toContain('51999998888');
    expect(texto).toContain('joao@exemplo.com');
  });

  it('ignora campo ausente sem deixar espaço duplo na busca', () => {
    // Responsável nulo é o caso de todo aluno adulto.
    expect(buildHaystack(['Bruno', null, undefined, ''])).toBe('bruno');
  });

  it('acha pelo telefone do responsável, que é quem atende na turma kids', () => {
    const texto = buildHaystack(['Ana Clara', '51999990000', '51988887777']);
    expect(texto.includes('51988887777')).toBe(true);
  });
});
