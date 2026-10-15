import { describe, expect, it } from 'vitest';

import {
  ADULT_RECENT_WINDOW_DAYS,
  BELT_ORDER,
  KIDS_GRADUATION_INTERVAL_DAYS,
  KIDS_MIN_CHECKINS,
  KIDS_TOTAL_DEGREES,
  calculateAge,
  diffInCalendarDays,
  getAdultSummary,
  getDegreeColor,
  getKidsGraduationStatus,
  listEligibleKids,
  listKidsAgenda,
  toIsoDate,
  type AdultStudent,
  type KidsStudent,
} from './graduationEngine';

/**
 * Noon in Sao Paulo (UTC-3, no DST since 2019). Explicit offsets keep the
 * suite deterministic regardless of the machine's local time zone.
 */
const spNoon = (isoDate: string): Date => new Date(`${isoDate}T12:00:00-03:00`);

const kid = (overrides: Partial<KidsStudent> = {}): KidsStudent => ({
  id: 'kid-1',
  name: 'Aluno Exemplo',
  birthDate: '2015-05-10',
  joinedAt: '2024-06-01',
  lastGraduationAt: '2025-01-01',
  degree: 1,
  belt: 'cinza',
  ...overrides,
});

const adult = (overrides: Partial<AdultStudent> = {}): AdultStudent => ({
  id: 'adult-1',
  name: 'Aluno Adulto',
  birthDate: '1995-08-20',
  joinedAt: '2023-02-10',
  lastGraduationAt: '2024-01-15',
  belt: 'azul',
  degree: 2,
  ...overrides,
});

describe('constants', () => {
  it('keeps the documented defaults', () => {
    expect(KIDS_GRADUATION_INTERVAL_DAYS).toBe(30);
    expect(KIDS_TOTAL_DEGREES).toBe(12);
    expect(ADULT_RECENT_WINDOW_DAYS).toBe(90);
    // Attendance rule ships disabled.
    expect(KIDS_MIN_CHECKINS).toBe(0);
  });

  it('orders adult belts by progression', () => {
    expect(BELT_ORDER).toEqual(['branca', 'azul', 'roxa', 'marrom', 'preta']);
  });
});

describe('getDegreeColor', () => {
  it('maps degrees 1-4 to a white stripe', () => {
    for (const degree of [1, 2, 3, 4]) {
      expect(getDegreeColor(degree)).toBe('branca');
    }
  });

  it('maps degrees 5-8 to a red stripe', () => {
    for (const degree of [5, 6, 7, 8]) {
      expect(getDegreeColor(degree)).toBe('vermelha');
    }
  });

  it('maps degrees 9-12 to a yellow stripe', () => {
    for (const degree of [9, 10, 11, 12]) {
      expect(getDegreeColor(degree)).toBe('amarela');
    }
  });

  it('returns null outside the ladder', () => {
    expect(getDegreeColor(0)).toBeNull();
    expect(getDegreeColor(13)).toBeNull();
    expect(getDegreeColor(-1)).toBeNull();
    expect(getDegreeColor(2.5)).toBeNull();
  });
});

describe('getKidsGraduationStatus - 30 day interval', () => {
  it('is eligible at exactly 30 days', () => {
    const result = getKidsGraduationStatus(
      kid({ lastGraduationAt: '2025-01-01' }),
      spNoon('2025-01-31'),
    );

    expect(result.daysSinceLastGraduation).toBe(30);
    expect(result.daysUntilEligible).toBe(0);
    expect(result.status).toBe('ELEGIVEL');
  });

  it('is still waiting at 29 days', () => {
    const result = getKidsGraduationStatus(
      kid({ lastGraduationAt: '2025-01-01' }),
      spNoon('2025-01-30'),
    );

    expect(result.daysSinceLastGraduation).toBe(29);
    expect(result.daysUntilEligible).toBe(1);
    expect(result.status).toBe('AGUARDANDO');
    expect(result.eligibleAt).toBe('2025-01-31');
  });

  it('stays eligible past the interval', () => {
    const result = getKidsGraduationStatus(
      kid({ lastGraduationAt: '2025-01-01' }),
      spNoon('2025-03-01'),
    );

    expect(result.daysSinceLastGraduation).toBe(59);
    expect(result.daysUntilEligible).toBe(0);
    expect(result.status).toBe('ELEGIVEL');
  });
});

describe('getKidsGraduationStatus - stripe colour transitions', () => {
  it('turns the stripe red crossing degree 4 -> 5', () => {
    const result = getKidsGraduationStatus(kid({ degree: 4 }), spNoon('2025-02-01'));

    expect(result.currentDegree).toBe(4);
    expect(result.currentDegreeColor).toBe('branca');
    expect(result.nextDegree).toBe(5);
    expect(result.nextDegreeColor).toBe('vermelha');
  });

  it('turns the stripe yellow crossing degree 8 -> 9', () => {
    const result = getKidsGraduationStatus(kid({ degree: 8 }), spNoon('2025-02-01'));

    expect(result.currentDegree).toBe(8);
    expect(result.currentDegreeColor).toBe('vermelha');
    expect(result.nextDegree).toBe(9);
    expect(result.nextDegreeColor).toBe('amarela');
  });

  it('keeps the stripe white inside degrees 1-4', () => {
    const result = getKidsGraduationStatus(kid({ degree: 3 }), spNoon('2025-02-01'));

    expect(result.currentDegreeColor).toBe('branca');
    expect(result.nextDegreeColor).toBe('branca');
  });
});

describe('getKidsGraduationStatus - end of the ladder', () => {
  it('reports PRONTO_PARA_AVALIACAO at degree 12', () => {
    const result = getKidsGraduationStatus(kid({ degree: 12 }), spNoon('2025-06-01'));

    expect(result.status).toBe('PRONTO_PARA_AVALIACAO');
    expect(result.currentDegree).toBe(12);
    expect(result.currentDegreeColor).toBe('amarela');
    expect(result.nextDegree).toBeNull();
    expect(result.nextDegreeColor).toBeNull();
  });

  it('does not fall back to ELEGIVEL once the ladder is complete', () => {
    const result = getKidsGraduationStatus(
      kid({ degree: 12, lastGraduationAt: '2024-01-01' }),
      spNoon('2025-06-01'),
    );

    expect(result.status).toBe('PRONTO_PARA_AVALIACAO');
  });
});

describe('getKidsGraduationStatus - turning 16', () => {
  it('is still a kid on the eve of the birthday', () => {
    const result = getKidsGraduationStatus(
      kid({ birthDate: '2009-06-15', degree: 5 }),
      spNoon('2025-06-14'),
    );

    expect(result.age).toBe(15);
    expect(result.status).not.toBe('MIGRAR_PARA_ADULTO');
  });

  it('migrates to adult exactly on the 16th birthday', () => {
    const result = getKidsGraduationStatus(
      kid({ birthDate: '2009-06-15', degree: 5 }),
      spNoon('2025-06-15'),
    );

    expect(result.age).toBe(16);
    expect(result.status).toBe('MIGRAR_PARA_ADULTO');
  });

  it('lets the age rule win over a complete ladder', () => {
    const result = getKidsGraduationStatus(
      kid({ birthDate: '2009-06-15', degree: 12 }),
      spNoon('2025-06-15'),
    );

    expect(result.status).toBe('MIGRAR_PARA_ADULTO');
  });
});

describe('calculateAge - leap years', () => {
  it('counts the birthday on 29 Feb of a leap year', () => {
    expect(calculateAge('2008-02-29', spNoon('2024-02-28'))).toBe(15);
    expect(calculateAge('2008-02-29', spNoon('2024-02-29'))).toBe(16);
  });

  it('waits for 1 March in a non-leap year', () => {
    expect(calculateAge('2008-02-29', spNoon('2025-02-28'))).toBe(16);
    expect(calculateAge('2008-02-29', spNoon('2025-03-01'))).toBe(17);
  });

  it('does not shift a date-only birth date across the time zone', () => {
    // Parsed as a UTC instant this would be 14 March in Sao Paulo and the
    // student would wrongly appear one year older on the eve of the birthday.
    expect(calculateAge('2010-03-15', spNoon('2025-03-14'))).toBe(14);
    expect(calculateAge('2010-03-15', spNoon('2025-03-15'))).toBe(15);
  });
});

describe('getKidsGraduationStatus - leap year interval', () => {
  it('crosses 29 February when counting 30 days', () => {
    const result = getKidsGraduationStatus(
      kid({ lastGraduationAt: '2024-02-01' }),
      spNoon('2024-03-01'),
    );

    expect(result.eligibleAt).toBe('2024-03-02');
    expect(result.daysSinceLastGraduation).toBe(29);
    expect(result.status).toBe('AGUARDANDO');

    const nextDay = getKidsGraduationStatus(
      kid({ lastGraduationAt: '2024-02-01' }),
      spNoon('2024-03-02'),
    );
    expect(nextDay.status).toBe('ELEGIVEL');
  });

  it('counts a shorter February in a non-leap year', () => {
    const result = getKidsGraduationStatus(
      kid({ lastGraduationAt: '2025-02-01' }),
      spNoon('2025-03-03'),
    );

    expect(result.eligibleAt).toBe('2025-03-03');
    expect(result.daysSinceLastGraduation).toBe(30);
    expect(result.status).toBe('ELEGIVEL');
  });
});

describe('getKidsGraduationStatus - month and year rollover', () => {
  it('rolls the eligibility date into the next month', () => {
    const result = getKidsGraduationStatus(
      kid({ lastGraduationAt: '2025-01-20' }),
      spNoon('2025-02-10'),
    );

    expect(result.eligibleAt).toBe('2025-02-19');
    expect(result.daysUntilEligible).toBe(9);
    expect(result.status).toBe('AGUARDANDO');
  });

  it('rolls across the new year', () => {
    const result = getKidsGraduationStatus(
      kid({ lastGraduationAt: '2024-12-20' }),
      spNoon('2025-01-19'),
    );

    expect(result.eligibleAt).toBe('2025-01-19');
    expect(result.daysSinceLastGraduation).toBe(30);
    expect(result.status).toBe('ELEGIVEL');
  });
});

describe('getKidsGraduationStatus - anchor selection', () => {
  it('falls back to joinedAt when the student never graduated', () => {
    const result = getKidsGraduationStatus(
      kid({ lastGraduationAt: null, joinedAt: '2025-01-05', degree: 0 }),
      spNoon('2025-02-04'),
    );

    expect(result.anchorSource).toBe('joinedAt');
    expect(result.anchorDate).toBe('2025-01-05');
    expect(result.daysSinceLastGraduation).toBe(30);
    expect(result.status).toBe('ELEGIVEL');
    expect(result.currentDegree).toBe(0);
    expect(result.currentDegreeColor).toBeNull();
    expect(result.nextDegree).toBe(1);
    expect(result.nextDegreeColor).toBe('branca');
  });

  it('prefers lastGraduationAt when both are present', () => {
    const result = getKidsGraduationStatus(
      kid({ joinedAt: '2024-01-01', lastGraduationAt: '2025-02-01' }),
      spNoon('2025-02-10'),
    );

    expect(result.anchorSource).toBe('lastGraduationAt');
    expect(result.anchorDate).toBe('2025-02-01');
    expect(result.status).toBe('AGUARDANDO');
  });
});

describe('getKidsGraduationStatus - Sao Paulo calendar days', () => {
  it('uses the Sao Paulo day, not the UTC day', () => {
    // 02:00Z on 31 Jan is still 23:00 on 30 Jan in Sao Paulo: 29 days.
    const beforeMidnight = getKidsGraduationStatus(
      kid({ lastGraduationAt: '2025-01-01' }),
      new Date('2025-01-31T02:00:00.000Z'),
    );
    expect(beforeMidnight.daysSinceLastGraduation).toBe(29);
    expect(beforeMidnight.status).toBe('AGUARDANDO');

    // 03:00Z is midnight in Sao Paulo: the 30th day has started.
    const afterMidnight = getKidsGraduationStatus(
      kid({ lastGraduationAt: '2025-01-01' }),
      new Date('2025-01-31T03:00:00.000Z'),
    );
    expect(afterMidnight.daysSinceLastGraduation).toBe(30);
    expect(afterMidnight.status).toBe('ELEGIVEL');
  });

  it('counts a late-night graduation timestamp as that calendar day', () => {
    const result = getKidsGraduationStatus(
      kid({ lastGraduationAt: '2025-01-02T01:30:00.000Z' }), // 01 Jan, 22:30 in SP
      spNoon('2025-01-31'),
    );

    expect(result.anchorDate).toBe('2025-01-01');
    expect(result.daysSinceLastGraduation).toBe(30);
  });

  it('is independent of the hour of the day', () => {
    const early = getKidsGraduationStatus(
      kid({ lastGraduationAt: '2025-01-01' }),
      new Date('2025-01-31T03:05:00.000Z'),
    );
    const late = getKidsGraduationStatus(
      kid({ lastGraduationAt: '2025-01-01' }),
      new Date('2025-02-01T02:55:00.000Z'),
    );

    expect(early.daysSinceLastGraduation).toBe(late.daysSinceLastGraduation);
  });
});

describe('getKidsGraduationStatus - optional attendance rule', () => {
  it('does not block anyone while KIDS_MIN_CHECKINS is 0', () => {
    const result = getKidsGraduationStatus(
      kid({ lastGraduationAt: '2025-01-01', checkinsInPeriod: 0 }),
      spNoon('2025-01-31'),
    );

    expect(result.blockedByCheckins).toBe(false);
    expect(result.status).toBe('ELEGIVEL');
  });
});

describe('listEligibleKids', () => {
  const now = spNoon('2025-03-01');

  const students: KidsStudent[] = [
    kid({ id: 'a', lastGraduationAt: '2025-01-10', degree: 2 }), // 50 days
    kid({ id: 'b', lastGraduationAt: '2025-02-25', degree: 2 }), // 4 days
    kid({ id: 'c', lastGraduationAt: '2024-12-01', degree: 2 }), // 90 days
    kid({ id: 'd', lastGraduationAt: '2024-01-01', degree: 12 }), // ladder done
    kid({ id: 'e', lastGraduationAt: '2024-01-01', birthDate: '2009-01-01' }), // 16+
  ];

  it('keeps only the eligible students', () => {
    expect(listEligibleKids(students, now).map((r) => r.studentId)).toEqual(['c', 'a']);
  });

  it('sorts by the longest wait first', () => {
    const [first, second] = listEligibleKids(students, now);

    expect(first?.daysSinceLastGraduation).toBe(90);
    expect(second?.daysSinceLastGraduation).toBe(50);
  });

  it('returns an empty list when nobody is eligible', () => {
    expect(listEligibleKids([students[1] as KidsStudent], now)).toEqual([]);
    expect(listEligibleKids([], now)).toEqual([]);
  });
});

describe('getAdultSummary', () => {
  const now = spNoon('2025-03-10');

  it('summarises time on the belt and attendance', () => {
    const summary = getAdultSummary(
      adult({ lastGraduationAt: '2024-01-15' }),
      ['2024-12-11', '2025-01-20', '2025-03-09'],
      now,
    );

    expect(summary.belt).toBe('azul');
    expect(summary.degree).toBe(2);
    expect(summary.lastGraduationAt).toBe('2024-01-15');
    expect(summary.daysOnCurrentBelt).toBe(420);
    expect(summary.monthsOnCurrentBelt).toBe(13);
    expect(summary.totalCheckins).toBe(3);
    expect(summary.lastCheckinAt).toBe('2025-03-09');
    expect(summary.age).toBe(29);
  });

  it('includes the 89th day and excludes the 90th in the recent window', () => {
    const summary = getAdultSummary(
      adult(),
      ['2024-12-11', '2024-12-10'], // 89 and 90 days before 2025-03-10
      now,
    );

    expect(summary.totalCheckins).toBe(2);
    expect(summary.checkinsLast90Days).toBe(1);
  });

  it('falls back to joinedAt when there is no graduation on record', () => {
    const summary = getAdultSummary(
      adult({ lastGraduationAt: null, joinedAt: '2025-01-10' }),
      [],
      now,
    );

    expect(summary.lastGraduationAt).toBeNull();
    expect(summary.daysOnCurrentBelt).toBe(59);
    expect(summary.monthsOnCurrentBelt).toBe(2);
    expect(summary.checkinsLast90Days).toBe(0);
    expect(summary.lastCheckinAt).toBeNull();
  });

  it('accepts ISO timestamps and folds them onto the Sao Paulo day', () => {
    const summary = getAdultSummary(
      adult(),
      ['2025-03-10T02:00:00.000Z'], // 09 March, 23:00 in SP
      now,
    );

    expect(summary.lastCheckinAt).toBe('2025-03-09');
    expect(summary.checkinsLast90Days).toBe(1);
  });
});

describe('date helpers', () => {
  it('measures calendar days between dates', () => {
    expect(diffInCalendarDays('2025-03-01', '2025-02-01')).toBe(28);
    expect(diffInCalendarDays('2024-03-01', '2024-02-01')).toBe(29);
    expect(diffInCalendarDays('2025-01-01', '2025-01-01')).toBe(0);
  });

  it('formats any input as a Sao Paulo civil date', () => {
    expect(toIsoDate('2025-07-04')).toBe('2025-07-04');
    expect(toIsoDate('2025-07-05T02:00:00.000Z')).toBe('2025-07-04');
    expect(toIsoDate(new Date('2025-07-05T03:00:00.000Z'))).toBe('2025-07-05');
  });

  it('rejects unparseable input', () => {
    expect(() => toIsoDate('amanha')).toThrow(RangeError);
  });
});

describe('listKidsAgenda', () => {
  const now = spNoon('2026-03-10');

  const turma: KidsStudent[] = [
    kid({ id: 'elegivel-ha-muito', lastGraduationAt: '2025-12-01', degree: 2 }),
    kid({ id: 'elegivel-recente', lastGraduationAt: '2026-02-08', degree: 2 }),
    kid({ id: 'vence-em-5-dias', lastGraduationAt: '2026-02-18', degree: 3 }),
    kid({ id: 'vence-em-25-dias', lastGraduationAt: '2026-03-07', degree: 1 }),
    kid({ id: 'escada-completa', lastGraduationAt: '2026-01-01', degree: 12 }),
    kid({ id: 'virou-adulto', birthDate: '2010-01-01', lastGraduationAt: '2026-01-01' }),
  ];

  it('devolve a turma inteira, não só quem já venceu', () => {
    expect(listKidsAgenda(turma, now)).toHaveLength(turma.length);
    expect(listEligibleKids(turma, now)).toHaveLength(2);
  });

  it('coloca os elegíveis primeiro, maior espera no topo', () => {
    const agenda = listKidsAgenda(turma, now);

    expect(agenda[0]?.studentId).toBe('elegivel-ha-muito');
    expect(agenda[1]?.studentId).toBe('elegivel-recente');
    expect(agenda[0]?.status).toBe('ELEGIVEL');
  });

  it('ordena quem aguarda pela data prevista mais próxima', () => {
    const aguardando = listKidsAgenda(turma, now).filter((r) => r.status === 'AGUARDANDO');

    expect(aguardando.map((r) => r.studentId)).toEqual(['vence-em-5-dias', 'vence-em-25-dias']);
    expect(aguardando[0]?.daysUntilEligible).toBeLessThan(
      aguardando[1]?.daysUntilEligible ?? 0,
    );
  });

  it('informa a data prevista de cada próximo grau', () => {
    const agenda = listKidsAgenda(turma, now);
    const proximo = agenda.find((r) => r.studentId === 'vence-em-5-dias');

    // 18/02 + 30 dias = 20/03 — é esta data que o professor precisa ver.
    expect(proximo?.eligibleAt).toBe('2026-03-20');
    expect(proximo?.daysUntilEligible).toBe(10);
    expect(proximo?.nextDegree).toBe(4);
    expect(proximo?.nextDegreeColor).toBe('branca');
  });

  it('joga para o fim quem saiu do fluxo automático', () => {
    const agenda = listKidsAgenda(turma, now);
    const finais = agenda.slice(-2).map((r) => r.status);

    expect(finais).toContain('PRONTO_PARA_AVALIACAO');
    expect(finais).toContain('MIGRAR_PARA_ADULTO');
  });

  it('aguenta turma vazia', () => {
    expect(listKidsAgenda([], now)).toEqual([]);
  });
});
