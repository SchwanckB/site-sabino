import { describe, expect, it } from 'vitest';

import {
  buildClassReport,
  countWeekdayOccurrences,
  occurrencesInMonth,
  type ReportCheckin,
  type ReportClass,
  type ReportStudent,
} from './classReport';

const now = new Date('2026-03-31T12:00:00-03:00');

const turmas: ReportClass[] = [
  { id: 'seg-kids', label: 'Seg 18:30 · Kids', weekday: 1, startTime: '18:30' },
  { id: 'seg-jj', label: 'Seg 20:30 · Jiu-Jitsu', weekday: 1, startTime: '20:30' },
];

const alunos: ReportStudent[] = [
  { id: 'a', classIds: ['seg-kids'] },
  { id: 'b', classIds: ['seg-kids'] },
  { id: 'c', classIds: ['seg-jj'] },
];

/** Dias atrás a partir de 31/03/2026. */
const atras = (n: number): string =>
  new Date(Date.UTC(2026, 2, 31) - n * 86_400_000).toISOString().slice(0, 10);

describe('buildClassReport', () => {
  it('conta só as presenças da própria turma', () => {
    const checkins: ReportCheckin[] = [
      { studentId: 'a', date: atras(3), classId: 'seg-kids' },
      { studentId: 'b', date: atras(3), classId: 'seg-kids' },
      { studentId: 'c', date: atras(3), classId: 'seg-jj' },
    ];

    const rows = buildClassReport(turmas, alunos, checkins, now);
    expect(rows.find((r) => r.id === 'seg-kids')?.recent).toBe(2);
    expect(rows.find((r) => r.id === 'seg-jj')?.recent).toBe(1);
  });

  it('ignora check-in antigo sem turma', () => {
    // Atribuí-lo a uma turma pelo horário seria chute.
    const checkins: ReportCheckin[] = [{ studentId: 'a', date: atras(3), classId: null }];

    const rows = buildClassReport(turmas, alunos, checkins, now);
    expect(rows.every((r) => r.recent === 0)).toBe(true);
  });

  it('conta os matriculados mesmo sem presença', () => {
    const rows = buildClassReport(turmas, alunos, [], now);

    expect(rows.find((r) => r.id === 'seg-kids')?.enrolled).toBe(2);
    expect(rows.find((r) => r.id === 'seg-jj')?.enrolled).toBe(1);
  });

  it('separa a janela recente da anterior', () => {
    const checkins: ReportCheckin[] = [
      { studentId: 'a', date: atras(5), classId: 'seg-kids' },
      { studentId: 'a', date: atras(40), classId: 'seg-kids' },
      { studentId: 'a', date: atras(45), classId: 'seg-kids' },
      // Fora das duas janelas.
      { studentId: 'a', date: atras(90), classId: 'seg-kids' },
    ];

    const kids = buildClassReport(turmas, alunos, checkins, now).find((r) => r.id === 'seg-kids');
    expect(kids?.recent).toBe(1);
    expect(kids?.previous).toBe(2);
  });

  it('calcula a queda contra a janela anterior', () => {
    const checkins: ReportCheckin[] = [
      { studentId: 'a', date: atras(5), classId: 'seg-kids' },
      { studentId: 'a', date: atras(40), classId: 'seg-kids' },
      { studentId: 'b', date: atras(41), classId: 'seg-kids' },
      { studentId: 'b', date: atras(42), classId: 'seg-kids' },
      { studentId: 'b', date: atras(43), classId: 'seg-kids' },
    ];

    const kids = buildClassReport(turmas, alunos, checkins, now).find((r) => r.id === 'seg-kids');
    // 1 contra 4: queda de 75%.
    expect(kids?.trend).toBeCloseTo(-0.75, 5);
  });

  it('sem base anterior, não inventa tendência', () => {
    const checkins: ReportCheckin[] = [{ studentId: 'a', date: atras(5), classId: 'seg-kids' }];
    const kids = buildClassReport(turmas, alunos, checkins, now).find((r) => r.id === 'seg-kids');

    expect(kids?.trend).toBeNull();
  });

  it('conta alunos distintos, não presenças', () => {
    const checkins: ReportCheckin[] = [
      { studentId: 'a', date: atras(3), classId: 'seg-kids' },
      { studentId: 'a', date: atras(10), classId: 'seg-kids' },
      { studentId: 'b', date: atras(10), classId: 'seg-kids' },
    ];

    const kids = buildClassReport(turmas, alunos, checkins, now).find((r) => r.id === 'seg-kids');
    expect(kids?.recent).toBe(3);
    expect(kids?.activeStudents).toBe(2);
  });

  it('divide pela quantidade real de aulas no período', () => {
    const checkins: ReportCheckin[] = [
      { studentId: 'a', date: atras(2), classId: 'seg-kids' },
      { studentId: 'b', date: atras(2), classId: 'seg-kids' },
    ];

    const kids = buildClassReport(turmas, alunos, checkins, now).find((r) => r.id === 'seg-kids');
    expect(kids?.sessions).toBeGreaterThanOrEqual(4);
    expect(kids?.averagePerSession).toBeCloseTo(2 / (kids?.sessions ?? 1), 5);
  });

  it('põe a turma mais cheia primeiro', () => {
    const checkins: ReportCheckin[] = [
      { studentId: 'c', date: atras(2), classId: 'seg-jj' },
      { studentId: 'c', date: atras(3), classId: 'seg-jj' },
      { studentId: 'a', date: atras(2), classId: 'seg-kids' },
    ];

    expect(buildClassReport(turmas, alunos, checkins, now)[0]?.id).toBe('seg-jj');
  });

  it('aguenta grade sem turma', () => {
    expect(buildClassReport([], alunos, [], now)).toEqual([]);
  });
});

describe('countWeekdayOccurrences', () => {
  it('conta as ocorrências do dia na janela', () => {
    // 31/03/2026 é terça. Em 30 dias há 4 ou 5 de cada dia.
    const segundas = countWeekdayOccurrences(1, '2026-03-31', 30);
    expect(segundas).toBeGreaterThanOrEqual(4);
    expect(segundas).toBeLessThanOrEqual(5);
  });

  it('uma semana tem exatamente uma de cada dia', () => {
    for (let dia = 0; dia < 7; dia++) {
      expect(countWeekdayOccurrences(dia, '2026-03-31', 7)).toBe(1);
    }
  });

  it('janela zerada não conta nada', () => {
    expect(countWeekdayOccurrences(1, '2026-03-31', 0)).toBe(0);
  });
});

describe('occurrencesInMonth', () => {
  it('conta as ocorrências do dia no mês civil', () => {
    // Março de 2026 começa num domingo e tem 31 dias: 5 domingos.
    expect(occurrencesInMonth(0, 2026, 3)).toBe(5);
    expect(occurrencesInMonth(1, 2026, 3)).toBe(5);
    expect(occurrencesInMonth(6, 2026, 3)).toBe(4);
  });

  it('soma 28, 29, 30 ou 31 conforme o mês', () => {
    const soma = (ano: number, mes: number) =>
      [0, 1, 2, 3, 4, 5, 6].reduce((t, d) => t + occurrencesInMonth(d, ano, mes), 0);

    expect(soma(2026, 2)).toBe(28);
    expect(soma(2024, 2)).toBe(29);
    expect(soma(2026, 4)).toBe(30);
    expect(soma(2026, 3)).toBe(31);
  });

  it('cada dia aparece ao menos quatro vezes', () => {
    for (let mes = 1; mes <= 12; mes++) {
      for (let dia = 0; dia < 7; dia++) {
        expect(occurrencesInMonth(dia, 2026, mes)).toBeGreaterThanOrEqual(4);
      }
    }
  });
});
