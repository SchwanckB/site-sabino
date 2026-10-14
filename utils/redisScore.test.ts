import { describe, expect, it } from 'vitest';

import { SCORE_MAX, SCORE_MIN, survivesJsonTransport } from './redisScore';

/**
 * Regressão do bug que derrubava `/admin` com "Application error".
 *
 * `listGraduationDueIds` e `listOverdueIds` passavam `Number.NEGATIVE_INFINITY`
 * para o `ZRANGE ... BYSCORE`. O comando chegava ao Redis com `null` no lugar
 * do limite e o servidor recusava — erro 500 logo após o login, porque a visão
 * geral do admin é a primeira tela depois de entrar.
 */
describe('limites de score do Redis', () => {
  it('usa os literais que o Redis entende', () => {
    expect(SCORE_MIN).toBe('-inf');
    expect(SCORE_MAX).toBe('+inf');
  });

  it('os literais atravessam a serialização JSON do protocolo REST', () => {
    expect(survivesJsonTransport(SCORE_MIN)).toBe(true);
    expect(survivesJsonTransport(SCORE_MAX)).toBe(true);
  });

  it('Infinity NÃO sobrevive - é exatamente a armadilha', () => {
    expect(survivesJsonTransport(Number.NEGATIVE_INFINITY)).toBe(false);
    expect(survivesJsonTransport(Number.POSITIVE_INFINITY)).toBe(false);
    expect(survivesJsonTransport(Number.NaN)).toBe(false);

    // O que o servidor receberia de fato:
    expect(JSON.parse(JSON.stringify({ v: Number.NEGATIVE_INFINITY })).v).toBeNull();
  });

  it('scores numéricos comuns seguem válidos', () => {
    expect(survivesJsonTransport(0)).toBe(true);
    expect(survivesJsonTransport(20_400)).toBe(true);
    expect(survivesJsonTransport(-20_400)).toBe(true);
  });
});
