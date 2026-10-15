import { describe, expect, it } from 'vitest';

import {
  MONTH_NAMES,
  buildMonth,
  shiftMonth,
  type DatedEvent,
  type PredictedGraduation,
  type RecurringClass,
} from './calendarMonth';

const now = new Date('2026-03-10T12:00:00-03:00');

/** Recorte da grade real: segunda e quarta. */
const aulas: RecurringClass[] = [
  { id: 'seg-1930-mma', weekday: 1, startTime: '19:30', endTime: '20:30', title: 'MMA', level: 'Todos os níveis' },
  { id: 'seg-2030-jj', weekday: 1, startTime: '20:30', endTime: '21:30', title: 'Jiu-Jitsu', level: 'Todos os níveis' },
  { id: 'qua-1930-mma', weekday: 3, startTime: '19:30', endTime: '20:30', title: 'MMA', level: 'Todos os níveis' },
];

describe('buildMonth - grade do mês', () => {
  it('devolve semanas completas, começando no domingo', () => {
    const dias = buildMonth(2026, 3, { classes: [], events: [], graduations: [] }, now);

    expect(dias.length % 7).toBe(0);
    expect(dias[0]?.weekday).toBe(0);
    expect(dias[dias.length - 1]?.weekday).toBe(6);
  });

  it('inclui os dias vizinhos para fechar a primeira semana', () => {
    // 1 de março de 2026 é domingo, então março começa alinhado.
    const marco = buildMonth(2026, 3, { classes: [], events: [], graduations: [] }, now);
    expect(marco[0]?.date).toBe('2026-03-01');
    expect(marco[0]?.inMonth).toBe(true);

    // Abril de 2026 começa numa quarta: a grade puxa dias de março.
    const abril = buildMonth(2026, 4, { classes: [], events: [], graduations: [] }, now);
    expect(abril[0]?.date).toBe('2026-03-29');
    expect(abril[0]?.inMonth).toBe(false);
    expect(abril.find((d) => d.date === '2026-04-01')?.inMonth).toBe(true);
  });

  it('marca o dia de hoje', () => {
    const dias = buildMonth(2026, 3, { classes: [], events: [], graduations: [] }, now);
    const hoje = dias.filter((d) => d.isToday);

    expect(hoje).toHaveLength(1);
    expect(hoje[0]?.date).toBe('2026-03-10');
  });

  it('cobre meses de 28, 30 e 31 dias', () => {
    const conta = (ano: number, mes: number) =>
      buildMonth(ano, mes, { classes: [], events: [], graduations: [] }, now).filter(
        (d) => d.inMonth,
      ).length;

    expect(conta(2026, 2)).toBe(28);
    expect(conta(2024, 2)).toBe(29);
    expect(conta(2026, 4)).toBe(30);
    expect(conta(2026, 3)).toBe(31);
  });
});

describe('buildMonth - aulas recorrentes', () => {
  it('repete a aula em toda ocorrência do dia da semana', () => {
    const dias = buildMonth(2026, 3, { classes: aulas, events: [], graduations: [] }, now);
    const segundas = dias.filter((d) => d.inMonth && d.weekday === 1);

    expect(segundas.length).toBeGreaterThan(3);
    for (const segunda of segundas) {
      expect(segunda.items.filter((i) => i.kind === 'aula')).toHaveLength(2);
    }
  });

  it('não coloca aula em dia sem turma', () => {
    const dias = buildMonth(2026, 3, { classes: aulas, events: [], graduations: [] }, now);
    const domingo = dias.find((d) => d.weekday === 0 && d.inMonth);

    expect(domingo?.items).toEqual([]);
  });

  it('ordena por horário dentro do dia', () => {
    const dias = buildMonth(2026, 3, { classes: aulas, events: [], graduations: [] }, now);
    const segunda = dias.find((d) => d.inMonth && d.weekday === 1);

    expect(segunda?.items.map((i) => i.time)).toEqual(['19:30', '20:30']);
  });

  it('guarda o id da turma, para o filtro por aula', () => {
    const dias = buildMonth(2026, 3, { classes: aulas, events: [], graduations: [] }, now);
    const segunda = dias.find((d) => d.inMonth && d.weekday === 1);

    expect(segunda?.items[0]?.classId).toBe('seg-1930-mma');
  });
});

describe('buildMonth - eventos', () => {
  const feriado: DatedEvent = {
    id: 'f1', date: '2026-03-02', title: 'Carnaval', kind: 'feriado',
    time: '', note: '', closesAcademy: true,
  };
  const confra: DatedEvent = {
    id: 'e1', date: '2026-03-21', title: 'Confraternização', kind: 'evento',
    time: '19:00', note: 'Churrasco no tatame', closesAcademy: false,
  };

  it('coloca o evento no dia certo', () => {
    const dias = buildMonth(2026, 3, { classes: aulas, events: [confra], graduations: [] }, now);
    const dia = dias.find((d) => d.date === '2026-03-21');

    expect(dia?.items.some((i) => i.title === 'Confraternização')).toBe(true);
  });

  it('feriado que fecha a academia cancela as aulas do dia', () => {
    // 02/03/2026 é segunda — teria duas aulas.
    const dias = buildMonth(2026, 3, { classes: aulas, events: [feriado], graduations: [] }, now);
    const dia = dias.find((d) => d.date === '2026-03-02');

    expect(dia?.items.filter((i) => i.kind === 'aula')).toHaveLength(0);
    expect(dia?.items.filter((i) => i.kind === 'feriado')).toHaveLength(1);
  });

  it('feriado que não fecha mantém a grade', () => {
    const pontoFacultativo: DatedEvent = { ...feriado, closesAcademy: false };
    const dias = buildMonth(2026, 3, { classes: aulas, events: [pontoFacultativo], graduations: [] }, now);
    const dia = dias.find((d) => d.date === '2026-03-02');

    expect(dia?.items.filter((i) => i.kind === 'aula')).toHaveLength(2);
  });

  it('evento de dia inteiro vem antes dos horários', () => {
    const dias = buildMonth(2026, 3, { classes: aulas, events: [{ ...confra, date: '2026-03-02', time: '' }] , graduations: [] }, now);
    const dia = dias.find((d) => d.date === '2026-03-02');

    expect(dia?.items[0]?.time).toBe('');
  });
});

describe('buildMonth - graduações previstas', () => {
  const graduacao: PredictedGraduation = {
    studentId: 'kid-1', studentName: 'João', date: '2026-03-20',
    nextDegree: 5, stripeColor: 'vermelha',
  };

  it('mostra o aluno e o grau previsto', () => {
    const dias = buildMonth(2026, 3, { classes: [], events: [], graduations: [graduacao] }, now);
    const dia = dias.find((d) => d.date === '2026-03-20');
    const item = dia?.items.find((i) => i.kind === 'graduacao');

    expect(item?.title).toBe('João');
    expect(item?.detail).toBe('grau 5 · tarja vermelha');
  });

  it('agrupa várias graduações no mesmo dia', () => {
    const dias = buildMonth(
      2026, 3,
      { classes: [], events: [], graduations: [graduacao, { ...graduacao, studentId: 'kid-2', studentName: 'Ana' }] },
      now,
    );
    const dia = dias.find((d) => d.date === '2026-03-20');

    expect(dia?.items.filter((i) => i.kind === 'graduacao')).toHaveLength(2);
  });

  it('ignora data fora do mês exibido', () => {
    const dias = buildMonth(
      2026, 3,
      { classes: [], events: [], graduations: [{ ...graduacao, date: '2026-08-10' }] },
      now,
    );

    expect(dias.some((d) => d.items.some((i) => i.kind === 'graduacao'))).toBe(false);
  });
});

describe('shiftMonth', () => {
  it('avança e volta sem estourar o ano', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 3, 0)).toEqual({ year: 2026, month: 3 });
    expect(shiftMonth(2026, 6, 12)).toEqual({ year: 2027, month: 6 });
  });

  it('nomeia os meses em português', () => {
    expect(MONTH_NAMES[2]).toBe('Março');
    expect(MONTH_NAMES).toHaveLength(12);
  });
});
