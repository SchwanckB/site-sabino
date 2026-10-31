import { describe, expect, it } from 'vitest';

import { extractToken } from './qrToken';

/**
 * Cada caso aqui corresponde a um QR que um aluno de fato vai apontar para o
 * leitor na porta da academia. O que importa é a diferença entre "código
 * válido" e "null": `null` tem de virar mensagem na tela, e antes virava um
 * retorno silencioso que deixava a câmera parada e a tela sem saída.
 */

describe('extractToken', () => {
  it('lê o código da URL do cartaz', () => {
    expect(extractToken('https://sabino.com.br/painel/checkin?t=abc123')).toBe('abc123');
  });

  it('aceita o código puro, do formato antigo do cartaz', () => {
    expect(extractToken('abc123')).toBe('abc123');
  });

  it('apara espaços', () => {
    expect(extractToken('  abc123  ')).toBe('abc123');
  });

  it('aceita o id da unidade colado à mão', () => {
    expect(extractToken('tres-cachoeiras')).toBe('tres-cachoeiras');
  });

  it('QR de outra coisa com URL válida devolve null', () => {
    // O caso que travava a tela: URL legítima, sem `?t=`.
    expect(extractToken('https://instagram.com/sabinoacademia')).toBeNull();
    expect(extractToken('https://sabino.com.br/painel')).toBeNull();
  });

  it('QR de Wi-Fi devolve null', () => {
    // `WIFI:` é um esquema válido, então isto parseia como URL e cai na mesma
    // regra do `?t=` ausente — que é o resultado desejado.
    expect(extractToken('WIFI:S:AcademiaSabino;T:WPA;P:senha123;;')).toBeNull();
  });

  it('`?t=` presente mas vazio devolve null', () => {
    expect(extractToken('https://sabino.com.br/painel/checkin?t=')).toBeNull();
    expect(extractToken('https://sabino.com.br/painel/checkin?t=%20%20')).toBeNull();
  });

  it('string vazia devolve null', () => {
    expect(extractToken('')).toBeNull();
    expect(extractToken('   ')).toBeNull();
  });

  it('QR absurdamente longo devolve null em vez de seguir adiante', () => {
    expect(extractToken('x'.repeat(513))).toBeNull();
  });

  it('ignora os outros parâmetros da URL', () => {
    expect(extractToken('https://sabino.com.br/painel/checkin?abrir=1&t=xyz&utm=cartaz')).toBe(
      'xyz',
    );
  });
});
