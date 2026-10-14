/**
 * Helpers de data/hora no fuso da academia.
 *
 * Funções puras: todas recebem `now: Date` por parâmetro. A regra é a mesma do
 * motor de graduação — o que vale é o **dia de calendário em São Paulo**, nunca
 * o dia UTC. Um treino que termina às 21h30 pertence ao dia em que começou,
 * mesmo que em UTC já seja o dia seguinte.
 */

export const TIME_ZONE = 'America/Sao_Paulo';

export interface SaoPauloParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  /** 0 = domingo ... 6 = sábado. */
  readonly weekday: number;
}

const WEEKDAY_INDEX: Readonly<Record<string, number>> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hour12: false,
});

/** Projeta um instante no calendário e relógio de São Paulo. */
export function saoPauloParts(now: Date): SaoPauloParts {
  if (Number.isNaN(now.getTime())) {
    throw new RangeError('Data inválida');
  }

  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let weekday = 0;

  for (const part of FORMATTER.formatToParts(now)) {
    switch (part.type) {
      case 'year':
        year = Number(part.value);
        break;
      case 'month':
        month = Number(part.value);
        break;
      case 'day':
        day = Number(part.value);
        break;
      case 'hour':
        // `hour12: false` pode devolver "24" na virada da meia-noite.
        hour = Number(part.value) % 24;
        break;
      case 'minute':
        minute = Number(part.value);
        break;
      case 'weekday':
        weekday = WEEKDAY_INDEX[part.value] ?? 0;
        break;
      default:
        break;
    }
  }

  return { year, month, day, hour, minute, weekday };
}

/** `YYYY-MM-DD` do dia civil em São Paulo. */
export function saoPauloDateString(now: Date): string {
  const { year, month, day } = saoPauloParts(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** `YYYY-MM` do mês civil em São Paulo — usado nos rankings mensais. */
export function saoPauloMonthString(now: Date): string {
  return saoPauloDateString(now).slice(0, 7);
}

/** Minutos desde a meia-noite em São Paulo (`19:30` → 1170). */
export function saoPauloMinutesOfDay(now: Date): number {
  const { hour, minute } = saoPauloParts(now);
  return hour * 60 + minute;
}

/** Converte `HH:mm` em minutos desde a meia-noite. */
export function timeToMinutes(time: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) {
    throw new RangeError(`Horário inválido: ${time}`);
  }
  const [, hours, minutes] = match;
  return Number(hours) * 60 + Number(minutes);
}

/** Segundos até a próxima meia-noite de São Paulo — TTL da trava de check-in. */
export function secondsUntilSaoPauloMidnight(now: Date): number {
  // Segundos são iguais em qualquer fuso de offset inteiro, como o de São Paulo.
  const elapsed = saoPauloMinutesOfDay(now) * 60 + now.getUTCSeconds();
  const total = 24 * 60 * 60;
  return Math.max(60, total - elapsed);
}

/** Último dia do mês (1-12). */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Monta uma data civil `YYYY-MM-DD` prendendo o dia ao último dia do mês.
 * Vencimento no dia 31 cai no dia 28/29/30 nos meses mais curtos.
 */
export function civilDate(year: number, month: number, day: number): string {
  let targetYear = year;
  let targetMonth = month;

  while (targetMonth > 12) {
    targetMonth -= 12;
    targetYear += 1;
  }
  while (targetMonth < 1) {
    targetMonth += 12;
    targetYear -= 1;
  }

  const clamped = Math.min(Math.max(day, 1), lastDayOfMonth(targetYear, targetMonth));
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
}

/** Soma meses a uma data civil, preservando o dia desejado quando possível. */
export function addMonths(isoDate: string, months: number, preferredDay?: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new RangeError(`Data inválida: ${isoDate}`);
  }
  const [, year, month, day] = match;

  const totalMonths = Number(year) * 12 + (Number(month) - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;

  return civilDate(targetYear, targetMonth, preferredDay ?? Number(day));
}

/** Soma dias a uma data civil `YYYY-MM-DD`. */
export function addDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new RangeError(`Data inválida: ${isoDate}`);
  }
  const [, year, month, day] = match;
  const result = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day) + days),
  );
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, '0')}-${String(result.getUTCDate()).padStart(2, '0')}`;
}

/** Diferença em dias de calendário entre duas datas civis (`a - b`). */
export function daysBetween(a: string, b: string): number {
  const toDay = (iso: string): number => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) {
      throw new RangeError(`Data inválida: ${iso}`);
    }
    const [, year, month, day] = match;
    return Math.floor(
      Date.UTC(Number(year), Number(month) - 1, Number(day)) / 86_400_000,
    );
  };
  return toDay(a) - toDay(b);
}

/** Meses completos entre duas datas civis (`a - b`). */
export function monthsBetween(a: string, b: string): number {
  const parse = (iso: string): [number, number, number] => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) {
      throw new RangeError(`Data inválida: ${iso}`);
    }
    const [, year, month, day] = match;
    return [Number(year), Number(month), Number(day)];
  };

  const [ay, am, ad] = parse(a);
  const [by, bm, bd] = parse(b);

  let months = (ay - by) * 12 + (am - bm);
  if (ad < bd) months -= 1;
  return months;
}

/** `2025-03-09` → `09/03/2025`. */
export function formatBr(isoDate: string | null | undefined): string {
  if (!isoDate) return '--';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}
