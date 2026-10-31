import { describe, expect, it } from 'vitest';

import { checkbox, intInRange, text, textList } from './formData';

/**
 * Leitura de `FormData`.
 *
 * `intInRange` existe por causa de um defeito concreto: as ações do admin liam
 * o grau com `Number(text(...)) || 0`, e isso transformava tanto `"abc"` quanto
 * `"9999"` em zero sem avisar ninguém.
 */

function form(campos: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [chave, valor] of Object.entries(campos)) {
    for (const item of Array.isArray(valor) ? valor : [valor]) data.append(chave, item);
  }
  return data;
}

describe('text', () => {
  it('apara espaços das pontas', () => {
    expect(text(form({ nome: '  Sabino  ' }), 'nome')).toBe('Sabino');
  });

  it('campo ausente vira string vazia', () => {
    expect(text(form({}), 'nome')).toBe('');
  });

  it('arquivo no lugar de texto vira string vazia em vez de "[object File]"', () => {
    const data = new FormData();
    data.append('nome', new File(['x'], 'a.txt', { type: 'text/plain' }));
    expect(text(data, 'nome')).toBe('');
  });
});

describe('checkbox', () => {
  it('marcado é "on"', () => {
    expect(checkbox(form({ aceito: 'on' }), 'aceito')).toBe(true);
  });

  it('ausente é desmarcado — é assim que o navegador envia', () => {
    expect(checkbox(form({}), 'aceito')).toBe(false);
  });

  it('qualquer outro valor não conta como marcado', () => {
    expect(checkbox(form({ aceito: 'true' }), 'aceito')).toBe(false);
  });
});

describe('textList', () => {
  it('junta os valores repetidos', () => {
    expect(textList(form({ turmas: ['a', 'b', 'c'] }), 'turmas')).toEqual(['a', 'b', 'c']);
  });

  it('campo ausente vira lista vazia', () => {
    expect(textList(form({}), 'turmas')).toEqual([]);
  });
});

describe('intInRange', () => {
  it('aceita valor dentro da faixa', () => {
    expect(intInRange(form({ grau: '7' }), 'grau', 0, 12)).toBe(7);
  });

  it('aceita os dois extremos', () => {
    expect(intInRange(form({ n: '0' }), 'n', 0, 12)).toBe(0);
    expect(intInRange(form({ n: '12' }), 'n', 0, 12)).toBe(12);
  });

  it('recusa acima do teto em vez de virar zero', () => {
    expect(intInRange(form({ grau: '9999' }), 'grau', 0, 12)).toBeNull();
  });

  it('recusa abaixo do piso', () => {
    expect(intInRange(form({ dia: '0' }), 'dia', 1, 31)).toBeNull();
  });

  it('recusa texto', () => {
    expect(intInRange(form({ grau: 'três' }), 'grau', 0, 12)).toBeNull();
  });

  it('recusa Infinity e NaN', () => {
    expect(intInRange(form({ n: 'Infinity' }), 'n', 0, 12)).toBeNull();
    expect(intInRange(form({ n: 'NaN' }), 'n', 0, 12)).toBeNull();
  });

  it('campo vazio é null — quem chama decide se vazio tem significado', () => {
    expect(intInRange(form({ n: '' }), 'n', 0, 12)).toBeNull();
    expect(intInRange(form({}), 'n', 0, 12)).toBeNull();
  });

  it('trunca decimal em vez de recusar: 7,9 graus é 7', () => {
    expect(intInRange(form({ n: '7.9' }), 'n', 0, 12)).toBe(7);
  });

  it('decimal que trunca para fora da faixa é recusado', () => {
    expect(intInRange(form({ n: '12.9' }), 'n', 0, 12)).toBe(12);
    expect(intInRange(form({ n: '13.1' }), 'n', 0, 12)).toBeNull();
  });
});
