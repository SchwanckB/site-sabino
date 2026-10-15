/**
 * Graduation engine - Sabino Academia.
 *
 * Pure domain logic: no I/O, no hidden clock. Every entry point receives
 * `now: Date` explicitly so the rules are fully deterministic and testable.
 *
 * All date comparisons are made in **calendar days of America/Sao_Paulo**,
 * never in raw milliseconds. A student who graduated at 23:30 on the 1st has
 * waited one day by 00:10 on the 2nd, which is how the academy counts it.
 */

/** IANA zone used for every calendar-day comparison. */
export const TIME_ZONE = 'America/Sao_Paulo';

/** Minimum interval between two Kids degrees. */
export const KIDS_GRADUATION_INTERVAL_DAYS = 30;

/**
 * Optional minimum check-ins inside the interval. Disabled by default (0) -
 * raise it to require attendance before a degree becomes available.
 */
export const KIDS_MIN_CHECKINS = 0;

/** Age at which a student leaves the automatic Kids flow. */
export const KIDS_MAX_AGE = 16;

/** Kids ladder length: 12 degrees before the belt evaluation. */
export const KIDS_TOTAL_DEGREES = 12;

/** Window used by the adult panel for "recent attendance". */
export const ADULT_RECENT_WINDOW_DAYS = 90;

/** Highest degree an adult can hold inside a belt. */
export const ADULT_MAX_DEGREE = 4;

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Accepted date input. A `YYYY-MM-DD` string is treated as a *civil* date in
 * Sao Paulo (a birth date has no time zone); anything else is parsed as an
 * instant and converted to the Sao Paulo calendar day.
 */
export type DateInput = string | Date;

/** Colour of the stripe attached to a Kids degree. */
export type StripeColor = 'branca' | 'vermelha' | 'amarela';

/** Adult belts, in progression order. */
export type AdultBelt = 'branca' | 'azul' | 'roxa' | 'marrom' | 'preta';

/** Adult belts in progression order, for sorting and filters. */
export const BELT_ORDER: readonly AdultBelt[] = [
  'branca',
  'azul',
  'roxa',
  'marrom',
  'preta',
];

export type GraduationStatus =
  /** Interval satisfied: the professor may register the next degree. */
  | 'ELEGIVEL'
  /** Still inside the waiting interval. */
  | 'AGUARDANDO'
  /** Finished the 12 degrees - belt change is a manual decision. */
  | 'PRONTO_PARA_AVALIACAO'
  /** Turned 16: leaves the automatic flow. */
  | 'MIGRAR_PARA_ADULTO';

export interface KidsStudent {
  readonly id: string;
  readonly name: string;
  /** Birth date (civil date). */
  readonly birthDate: DateInput;
  /** Approval date - fallback anchor when there is no previous graduation. */
  readonly joinedAt: DateInput;
  /** Last graduation; `null` for a student who never graduated. */
  readonly lastGraduationAt: DateInput | null;
  /** Current degree, 0 to {@link KIDS_TOTAL_DEGREES}. */
  readonly degree: number;
  /** Belt label shown in the UI (Kids belts are academy-specific). */
  readonly belt: string;
  readonly avatarUrl?: string | null;
  /** Check-ins inside the current interval - only read when KIDS_MIN_CHECKINS > 0. */
  readonly checkinsInPeriod?: number;
}

export interface GraduationResult {
  readonly studentId: string;
  readonly status: GraduationStatus;
  /** Age in completed years, on the Sao Paulo calendar. */
  readonly age: number;
  readonly currentDegree: number;
  /** Stripe colour of the current degree; `null` at degree 0. */
  readonly currentDegreeColor: StripeColor | null;
  /** Next degree, or `null` once the ladder is complete. */
  readonly nextDegree: number | null;
  /** Stripe colour of the next degree; `null` once the ladder is complete. */
  readonly nextDegreeColor: StripeColor | null;
  /**
   * Calendar days since the anchor. Negative only when the anchor was typed
   * with a future date, which the dashboard surfaces as a data warning.
   */
  readonly daysSinceLastGraduation: number;
  /** Calendar days still missing; `0` once the interval is satisfied. */
  readonly daysUntilEligible: number;
  /** Date the interval is met, `YYYY-MM-DD`. */
  readonly eligibleAt: string;
  /** Anchor actually used, `YYYY-MM-DD`. */
  readonly anchorDate: string;
  readonly anchorSource: 'lastGraduationAt' | 'joinedAt';
  /** `true` when only the attendance rule is holding the degree back. */
  readonly blockedByCheckins: boolean;
}

export interface AdultStudent {
  readonly id: string;
  readonly name: string;
  readonly birthDate: DateInput;
  readonly joinedAt: DateInput;
  readonly lastGraduationAt: DateInput | null;
  readonly belt: AdultBelt;
  /** Degree inside the belt, 0 to {@link ADULT_MAX_DEGREE}. */
  readonly degree: number;
  readonly avatarUrl?: string | null;
}

export interface AdultSummary {
  readonly studentId: string;
  readonly name: string;
  readonly age: number;
  readonly belt: AdultBelt;
  readonly degree: number;
  /** `YYYY-MM-DD`, or `null` when the student never graduated here. */
  readonly lastGraduationAt: string | null;
  readonly daysOnCurrentBelt: number;
  readonly monthsOnCurrentBelt: number;
  readonly totalCheckins: number;
  readonly checkinsLast90Days: number;
  /** `YYYY-MM-DD` of the most recent check-in, or `null`. */
  readonly lastCheckinAt: string | null;
}

/* -------------------------------------------------------------------------- */
/* Calendar helpers (Sao Paulo)                                               */
/* -------------------------------------------------------------------------- */

interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const MS_PER_DAY = 86_400_000;

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const SAO_PAULO_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Projects an instant onto the Sao Paulo calendar. */
function instantToCivilDate(date: Date): CivilDate {
  const time = date.getTime();
  if (Number.isNaN(time)) {
    throw new RangeError('Invalid Date passed to the graduation engine');
  }

  let year = 0;
  let month = 0;
  let day = 0;

  for (const part of SAO_PAULO_PARTS.formatToParts(date)) {
    if (part.type === 'year') year = Number(part.value);
    else if (part.type === 'month') month = Number(part.value);
    else if (part.type === 'day') day = Number(part.value);
  }

  return { year, month, day };
}

/**
 * Normalises any accepted input to a Sao Paulo civil date.
 *
 * `YYYY-MM-DD` is taken literally: `new Date('2010-03-15')` would be UTC
 * midnight, which is still 14 March in Sao Paulo (UTC-3) and would shift every
 * birth date by one day.
 */
function toCivilDate(value: DateInput): CivilDate {
  if (value instanceof Date) {
    return instantToCivilDate(value);
  }

  const dateOnly = DATE_ONLY_PATTERN.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return { year: Number(year), month: Number(month), day: Number(day) };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new RangeError(`Unparseable date passed to the graduation engine: ${value}`);
  }
  return instantToCivilDate(parsed);
}

/** Days elapsed since the Unix epoch - the unit every comparison uses. */
function toDayNumber(civil: CivilDate): number {
  return Math.floor(Date.UTC(civil.year, civil.month - 1, civil.day) / MS_PER_DAY);
}

function fromDayNumber(dayNumber: number): CivilDate {
  const date = new Date(dayNumber * MS_PER_DAY);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function formatCivilDate(civil: CivilDate): string {
  const month = String(civil.month).padStart(2, '0');
  const day = String(civil.day).padStart(2, '0');
  return `${civil.year}-${month}-${day}`;
}

/** Calendar day of `value` in Sao Paulo, as a day number. */
function dayNumberOf(value: DateInput): number {
  return toDayNumber(toCivilDate(value));
}

/**
 * Calendar days between two dates (`later - earlier`), in Sao Paulo.
 * Exported because the dashboard and the ranking share the same unit.
 */
export function diffInCalendarDays(later: DateInput, earlier: DateInput): number {
  return dayNumberOf(later) - dayNumberOf(earlier);
}

/** Formats any accepted input as a `YYYY-MM-DD` Sao Paulo civil date. */
export function toIsoDate(value: DateInput): string {
  return formatCivilDate(toCivilDate(value));
}

/* -------------------------------------------------------------------------- */
/* Public rules                                                               */
/* -------------------------------------------------------------------------- */

/** Age in completed years, on the Sao Paulo calendar. */
export function calculateAge(birthDate: DateInput, now: Date): number {
  const birth = toCivilDate(birthDate);
  const today = toCivilDate(now);

  let age = today.year - birth.year;
  const hasHadBirthday =
    today.month > birth.month ||
    (today.month === birth.month && today.day >= birth.day);

  if (!hasHadBirthday) {
    age -= 1;
  }

  return age;
}

/**
 * Stripe colour of a Kids degree: 1-4 white, 5-8 red, 9-12 yellow.
 * Returns `null` outside the ladder (degree 0 or above 12).
 */
export function getDegreeColor(degree: number): StripeColor | null {
  if (!Number.isInteger(degree) || degree < 1 || degree > KIDS_TOTAL_DEGREES) {
    return null;
  }
  if (degree <= 4) return 'branca';
  if (degree <= 8) return 'vermelha';
  return 'amarela';
}

/**
 * Evaluates one Kids student against the degree rules.
 *
 * Precedence: age first (16+ leaves the automatic flow even with a full
 * ladder), then a complete ladder, then the interval.
 */
export function getKidsGraduationStatus(
  student: KidsStudent,
  now: Date,
): GraduationResult {
  const age = calculateAge(student.birthDate, now);

  const currentDegree = Math.min(
    Math.max(Math.trunc(student.degree), 0),
    KIDS_TOTAL_DEGREES,
  );
  const hasCompletedLadder = currentDegree >= KIDS_TOTAL_DEGREES;
  const nextDegree = hasCompletedLadder ? null : currentDegree + 1;

  const anchorSource = student.lastGraduationAt !== null ? 'lastGraduationAt' : 'joinedAt';
  const anchorInput = student.lastGraduationAt ?? student.joinedAt;
  const anchorDay = dayNumberOf(anchorInput);
  const todayDay = dayNumberOf(now);

  const daysSinceLastGraduation = todayDay - anchorDay;
  const eligibleDay = anchorDay + KIDS_GRADUATION_INTERVAL_DAYS;
  const daysUntilEligible = Math.max(0, eligibleDay - todayDay);

  const intervalSatisfied = daysUntilEligible === 0;
  const checkinsSatisfied = (student.checkinsInPeriod ?? 0) >= KIDS_MIN_CHECKINS;
  const blockedByCheckins = intervalSatisfied && !checkinsSatisfied;

  let status: GraduationStatus;
  if (age >= KIDS_MAX_AGE) {
    status = 'MIGRAR_PARA_ADULTO';
  } else if (hasCompletedLadder) {
    status = 'PRONTO_PARA_AVALIACAO';
  } else if (intervalSatisfied && checkinsSatisfied) {
    status = 'ELEGIVEL';
  } else {
    status = 'AGUARDANDO';
  }

  return {
    studentId: student.id,
    status,
    age,
    currentDegree,
    currentDegreeColor: getDegreeColor(currentDegree),
    nextDegree,
    nextDegreeColor: nextDegree === null ? null : getDegreeColor(nextDegree),
    daysSinceLastGraduation,
    daysUntilEligible,
    eligibleAt: formatCivilDate(fromDayNumber(eligibleDay)),
    anchorDate: formatCivilDate(fromDayNumber(anchorDay)),
    anchorSource,
    blockedByCheckins,
  };
}

/**
 * Kids eligible for a degree right now, longest wait first.
 * Feeds the "Criancas Elegiveis para Grau este Mes" tab.
 */
export function listEligibleKids(
  students: readonly KidsStudent[],
  now: Date,
): GraduationResult[] {
  return students
    .map((student) => getKidsGraduationStatus(student, now))
    .filter((result) => result.status === 'ELEGIVEL')
    .sort((a, b) => b.daysSinceLastGraduation - a.daysSinceLastGraduation);
}

/** Janela padrão da agenda: quanto à frente o painel enxerga. */
export const AGENDA_HORIZON_DAYS = 60;

/**
 * Agenda de graduação infantil.
 *
 * Diferente de {@link listEligibleKids}, devolve **todos** os alunos da trilha
 * infantil com a data prevista do próximo grau — inclusive quem ainda está
 * esperando. É o que permite ao professor planejar ("dia 19 do mês que vem
 * fecham três graus") em vez de só reagir ao que já venceu.
 *
 * Ordem: quem está elegível há mais tempo primeiro, depois por data prevista.
 * Quem saiu do fluxo (16 anos ou 12 graus) vai para o fim — não tem data.
 */
export function listKidsAgenda(
  students: readonly KidsStudent[],
  now: Date,
): GraduationResult[] {
  const weight = (result: GraduationResult): number => {
    if (result.status === 'ELEGIVEL') return 0;
    if (result.status === 'AGUARDANDO') return 1;
    return 2;
  };

  return students
    .map((student) => getKidsGraduationStatus(student, now))
    .sort((a, b) => {
      const byStatus = weight(a) - weight(b);
      if (byStatus !== 0) return byStatus;

      // Elegíveis: maior espera primeiro. Aguardando: quem vence antes.
      if (a.status === 'ELEGIVEL') {
        return b.daysSinceLastGraduation - a.daysSinceLastGraduation;
      }
      return a.daysUntilEligible - b.daysUntilEligible;
    });
}

/**
 * Decision support for adults - no automation, just the facts the professor
 * needs. `checkins` is the full check-in history for the student.
 */
export function getAdultSummary(
  student: AdultStudent,
  checkins: readonly DateInput[],
  now: Date,
): AdultSummary {
  const todayDay = dayNumberOf(now);
  const anchorInput = student.lastGraduationAt ?? student.joinedAt;
  const anchorCivil = toCivilDate(anchorInput);
  const todayCivil = toCivilDate(now);

  let monthsOnCurrentBelt =
    (todayCivil.year - anchorCivil.year) * 12 + (todayCivil.month - anchorCivil.month);
  if (todayCivil.day < anchorCivil.day) {
    monthsOnCurrentBelt -= 1;
  }

  let checkinsLast90Days = 0;
  let lastCheckinDay: number | null = null;

  for (const checkin of checkins) {
    const day = dayNumberOf(checkin);
    const elapsed = todayDay - day;

    if (elapsed >= 0 && elapsed < ADULT_RECENT_WINDOW_DAYS) {
      checkinsLast90Days += 1;
    }
    if (lastCheckinDay === null || day > lastCheckinDay) {
      lastCheckinDay = day;
    }
  }

  return {
    studentId: student.id,
    name: student.name,
    age: calculateAge(student.birthDate, now),
    belt: student.belt,
    degree: Math.min(Math.max(Math.trunc(student.degree), 0), ADULT_MAX_DEGREE),
    lastGraduationAt:
      student.lastGraduationAt === null ? null : toIsoDate(student.lastGraduationAt),
    daysOnCurrentBelt: todayDay - toDayNumber(anchorCivil),
    monthsOnCurrentBelt: Math.max(0, monthsOnCurrentBelt),
    totalCheckins: checkins.length,
    checkinsLast90Days,
    lastCheckinAt:
      lastCheckinDay === null ? null : formatCivilDate(fromDayNumber(lastCheckinDay)),
  };
}
