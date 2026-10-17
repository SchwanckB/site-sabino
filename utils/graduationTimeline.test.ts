import { describe, expect, it } from 'vitest';

import { buildTimeline, formatSpan, type HistoryEntry } from './graduationTimeline';

const now = new Date('2026-06-01T12:00:00-03:00');

/** Histórico como o Redis devolve: do mais recente para o mais antigo. */
const historico: HistoryEntry[] = [
  { at: '2026-03-01T12:00:00.000Z', fromBelt: 'branca', fromDegree: 4, toBelt: 'azul', toDegree: 0 },
  { at: '2025-09-01T12:00:00.000Z', fromBelt: 'branca', fromDegree: 3, toBelt: 'branca', toDegree: 4 },
  { at: '2025-03-01T12:00:00.000Z', fromBelt: 'branca', fromDegree: 2, toBelt: 'branca', toDegree: 3 },
];

describe('buildTimeline - entradas', () => {
  it('devolve do mais recente para o mais antigo', () => {
    const { entries } = buildTimeline(historico, '2024-01-01', now);

    expect(entries.map((e) => e.at.slice(0, 10))).toEqual([
      '2026-03-01',
      '2025-09-01',
      '2025-03-01',
    ]);
  });

  it('marca mudança de faixa separada de grau', () => {
    const { entries } = buildTimeline(historico, '2024-01-01', now);

    expect(entries[0]?.isBeltChange).toBe(true);
    expect(entries[1]?.isBeltChange).toBe(false);
  });

  it('conta os dias desde o passo anterior', () => {
    const { entries } = buildTimeline(historico, '2024-01-01', now);

    // 01/09/2025 -> 01/03/2026 são 181 dias.
    expect(entries[0]?.daysSincePrevious).toBe(181);
    // 01/03/2025 -> 01/09/2025 são 184 dias.
    expect(entries[1]?.daysSincePrevious).toBe(184);
  });

  it('o primeiro passo conta desde a matrícula', () => {
    const { entries } = buildTimeline(historico, '2025-01-01T00:00:00.000Z', now);
    const primeiro = entries[entries.length - 1];

    expect(primeiro?.daysSincePrevious).toBe(59);
  });

  it('sem matrícula conhecida, o primeiro passo não inventa intervalo', () => {
    const { entries } = buildTimeline(historico, null, now);

    expect(entries[entries.length - 1]?.daysSincePrevious).toBeNull();
  });

  it('aguenta histórico vazio', () => {
    const vazio = buildTimeline([], '2024-01-01', now);

    expect(vazio.entries).toEqual([]);
    expect(vazio.belts).toEqual([]);
    expect(vazio.daysSinceLast).toBeNull();
  });
});

describe('buildTimeline - tempo por faixa', () => {
  it('fecha a faixa anterior na data da promoção', () => {
    const { belts } = buildTimeline(historico, '2024-01-01', now);

    expect(belts).toHaveLength(2);
    expect(belts[0]?.belt).toBe('branca');
    expect(belts[0]?.from).toBe('2024-01-01');
    expect(belts[0]?.to).toBe('2026-03-01');
  });

  it('conta os graus conquistados dentro da faixa', () => {
    const { belts } = buildTimeline(historico, '2024-01-01', now);

    expect(belts[0]?.degreesEarned).toBe(2);
  });

  it('a faixa atual fica aberta e conta até hoje', () => {
    const { belts } = buildTimeline(historico, '2024-01-01', now);
    const atual = belts[belts.length - 1];

    expect(atual?.belt).toBe('azul');
    expect(atual?.to).toBeNull();
    // 01/03/2026 -> 01/06/2026 são 92 dias.
    expect(atual?.days).toBe(92);
  });

  it('a primeira faixa começa na matrícula, não na primeira graduação', () => {
    // Sem isso, o tempo de faixa branca começaria a contar só no 1º grau.
    const { belts } = buildTimeline(historico, '2024-01-01', now);

    expect(belts[0]?.days).toBeGreaterThan(700);
  });

  it('sem matrícula, a primeira faixa começa no primeiro registro', () => {
    const { belts } = buildTimeline(historico, null, now);

    expect(belts[0]?.from).toBe('2025-03-01');
  });
});

describe('buildTimeline - desde a última', () => {
  it('conta os dias desde a graduação mais recente', () => {
    expect(buildTimeline(historico, '2024-01-01', now).daysSinceLast).toBe(92);
  });
});

describe('formatSpan', () => {
  it('fala em dias no começo', () => {
    expect(formatSpan(1)).toBe('1 dia');
    expect(formatSpan(30)).toBe('30 dias');
    expect(formatSpan(44)).toBe('44 dias');
  });

  it('passa a meses quando dias deixam de dizer algo', () => {
    expect(formatSpan(45)).toBe('1 meses');
    expect(formatSpan(183)).toBe('6 meses');
  });

  it('passa a anos depois de um ano e meio', () => {
    expect(formatSpan(548)).toBe('1a 6m');
    expect(formatSpan(730)).toBe('2 anos');
  });

  it('não quebra com entrada inválida', () => {
    expect(formatSpan(-5)).toBe('--');
    expect(formatSpan(0)).toBe('0 dias');
  });
});
