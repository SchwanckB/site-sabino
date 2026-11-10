import { describe, expect, it } from 'vitest';

import { rankByScoreThenSeniority } from './ranking';

/** Mapa de cadastro para os casos, no formato que a função espera. */
const cadastros = (pares: Record<string, string>) => (id: string) => pares[id] ?? null;

describe('rankByScoreThenSeniority', () => {
  it('ordena por pontuação, maior primeiro', () => {
    const rows = [
      { userId: 'a', score: 3 },
      { userId: 'b', score: 9 },
      { userId: 'c', score: 5 },
    ];

    const ranked = rankByScoreThenSeniority(rows, cadastros({}));

    expect(ranked.map((r) => r.entry.userId)).toEqual(['b', 'c', 'a']);
    expect(ranked.map((r) => r.position)).toEqual([1, 2, 3]);
  });

  it('desempata pelo cadastro mais antigo', () => {
    const rows = [
      { userId: 'novato', score: 8 },
      { userId: 'veterano', score: 8 },
    ];

    const ranked = rankByScoreThenSeniority(
      rows,
      cadastros({
        novato: '2026-10-01T10:00:00.000Z',
        veterano: '2024-02-15T10:00:00.000Z',
      }),
    );

    expect(ranked.map((r) => r.entry.userId)).toEqual(['veterano', 'novato']);
  });

  it('não deixa o desempate atravessar pontuações diferentes', () => {
    // O veterano tem menos ponto: antiguidade não compra posição.
    const rows = [
      { userId: 'novato', score: 10 },
      { userId: 'veterano', score: 9 },
    ];

    const ranked = rankByScoreThenSeniority(
      rows,
      cadastros({
        novato: '2026-10-01T10:00:00.000Z',
        veterano: '2024-02-15T10:00:00.000Z',
      }),
    );

    expect(ranked.map((r) => r.entry.userId)).toEqual(['novato', 'veterano']);
  });

  it('manda para o fim do empate quem não tem data de cadastro', () => {
    const rows = [
      { userId: 'sem-ficha', score: 7 },
      { userId: 'com-ficha', score: 7 },
    ];

    const ranked = rankByScoreThenSeniority(
      rows,
      cadastros({ 'com-ficha': '2025-05-05T10:00:00.000Z' }),
    );

    expect(ranked.map((r) => r.entry.userId)).toEqual(['com-ficha', 'sem-ficha']);
  });

  it('é estável quando o cadastro é idêntico, para a lista não trocar de ordem sozinha', () => {
    const mesmoInstante = '2025-01-01T00:00:00.000Z';
    const pares = cadastros({ zeca: mesmoInstante, ana: mesmoInstante });

    const umaOrdem = rankByScoreThenSeniority(
      [
        { userId: 'zeca', score: 4 },
        { userId: 'ana', score: 4 },
      ],
      pares,
    );

    const outraOrdem = rankByScoreThenSeniority(
      [
        { userId: 'ana', score: 4 },
        { userId: 'zeca', score: 4 },
      ],
      pares,
    );

    expect(umaOrdem.map((r) => r.entry.userId)).toEqual(['ana', 'zeca']);
    expect(outraOrdem.map((r) => r.entry.userId)).toEqual(['ana', 'zeca']);
  });

  it('não altera o array recebido', () => {
    const rows = [
      { userId: 'a', score: 1 },
      { userId: 'b', score: 2 },
    ];

    rankByScoreThenSeniority(rows, cadastros({}));

    expect(rows.map((r) => r.userId)).toEqual(['a', 'b']);
  });

  it('numera sem buraco mesmo com empate triplo', () => {
    const rows = [
      { userId: 'c', score: 5 },
      { userId: 'a', score: 5 },
      { userId: 'b', score: 5 },
    ];

    const ranked = rankByScoreThenSeniority(
      rows,
      cadastros({
        a: '2024-01-01T00:00:00.000Z',
        b: '2025-01-01T00:00:00.000Z',
        c: '2026-01-01T00:00:00.000Z',
      }),
    );

    expect(ranked.map((r) => r.entry.userId)).toEqual(['a', 'b', 'c']);
    expect(ranked.map((r) => r.position)).toEqual([1, 2, 3]);
  });

  it('devolve lista vazia sem reclamar', () => {
    expect(rankByScoreThenSeniority([], cadastros({}))).toEqual([]);
  });
});
