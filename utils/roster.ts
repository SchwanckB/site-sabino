/**
 * Leituras da ficha que dependem só da data de nascimento e do nome.
 *
 * Funções puras, sem I/O: recebem `now` e devolvem o recorte pronto. Ficam
 * fora dos repositórios porque a mesma lista serve ao painel, ao calendário e
 * à agenda de graduação — e porque assim dá para testar os casos difíceis
 * (29 de fevereiro, virada de ano) sem subir banco.
 */

import { calculateAge, KIDS_MAX_AGE } from './graduationEngine';
import { civilDate, lastDayOfMonth, saoPauloDateString } from './datetime';

export interface PersonLike {
  readonly id: string;
  readonly name: string;
  /** `YYYY-MM-DD`. */
  readonly birthDate: string;
}

/* -------------------------------------------------------------------------- */
/* Aniversariantes                                                            */
/* -------------------------------------------------------------------------- */

export interface Birthday {
  readonly id: string;
  readonly name: string;
  /** Dia do mês, 1 a 31. */
  readonly day: number;
  /** `YYYY-MM-DD` da data no mês consultado. */
  readonly date: string;
  /** Idade que a pessoa completa nesse aniversário. */
  readonly turning: number;
  readonly isToday: boolean;
  /** Já passou neste mês. */
  readonly isPast: boolean;
}

/**
 * Aniversariantes de um mês, em ordem de dia.
 *
 * Quem nasceu em 29 de fevereiro é listado no dia 28 nos anos comuns: é o que
 * a academia faz na prática — parabeniza no fim do mês, não em março.
 */
export function listBirthdays(
  people: readonly PersonLike[],
  year: number,
  month: number,
  now: Date,
): Birthday[] {
  const today = saoPauloDateString(now);
  const ultimoDia = lastDayOfMonth(year, month);

  const lista: Birthday[] = [];

  for (const person of people) {
    const parts = person.birthDate.split('-');
    const nascMes = Number(parts[1]);
    const nascDia = Number(parts[2]);
    const nascAno = Number(parts[0]);

    if (!Number.isFinite(nascMes) || !Number.isFinite(nascDia) || nascMes !== month) continue;

    const day = Math.min(nascDia, ultimoDia);
    const date = civilDate(year, month, day);

    lista.push({
      id: person.id,
      name: person.name,
      day,
      date,
      turning: year - nascAno,
      isToday: date === today,
      isPast: date < today,
    });
  }

  return lista.sort((a, b) => (a.day !== b.day ? a.day - b.day : a.name.localeCompare(b.name)));
}

/* -------------------------------------------------------------------------- */
/* Saída da trilha infantil                                                   */
/* -------------------------------------------------------------------------- */

/** Com quantos dias de antecedência avisar que a criança faz 16. */
export const AGE_TRANSITION_WARNING_DAYS = 60;

export interface AgeTransition {
  readonly id: string;
  readonly name: string;
  /** `YYYY-MM-DD` do aniversário de 16 anos. */
  readonly date: string;
  /** Negativo quando já passou. */
  readonly daysUntil: number;
  /** Já tem 16 ou mais e continua na trilha infantil. */
  readonly overdue: boolean;
}

/**
 * Crianças prestes a sair da trilha infantil — ou que já saíram sem ninguém
 * reparar.
 *
 * Aos 16 o grau deixa de cair a cada 30 dias e o aluno passa à faixa adulta.
 * Sem aviso, isso só aparece quando alguém estranha que o aluno parou de
 * graduar. Os atrasados vêm primeiro: são os que já estão errados hoje.
 */
export function listAgeTransitions(
  people: readonly PersonLike[],
  now: Date,
  warningDays: number = AGE_TRANSITION_WARNING_DAYS,
): AgeTransition[] {
  const hoje = saoPauloDateString(now);

  const lista: AgeTransition[] = [];

  for (const person of people) {
    const parts = person.birthDate.split('-');
    const ano = Number(parts[0]);
    const mes = Number(parts[1]);
    const dia = Number(parts[2]);

    if (!Number.isFinite(ano) || !Number.isFinite(mes) || !Number.isFinite(dia)) continue;

    // Nascido em 29/02 completa anos em 28/02 nos anos comuns.
    const diaNoAno = Math.min(dia, lastDayOfMonth(ano + KIDS_MAX_AGE, mes));
    const date = civilDate(ano + KIDS_MAX_AGE, mes, diaNoAno);
    const daysUntil = diffDays(hoje, date);
    const idade = calculateAge(person.birthDate, now);

    if (idade >= KIDS_MAX_AGE) {
      lista.push({ id: person.id, name: person.name, date, daysUntil, overdue: true });
      continue;
    }

    if (daysUntil <= warningDays) {
      lista.push({ id: person.id, name: person.name, date, daysUntil, overdue: false });
    }
  }

  return lista.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return a.daysUntil - b.daysUntil;
  });
}

/* -------------------------------------------------------------------------- */
/* Nome no ranking                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Primeiro nome mais a inicial do sobrenome.
 *
 * O ranking é visível para os outros alunos. Numa academia de cidade pequena
 * todo mundo se reconhece por "Ana C.", e o nome completo de um menor de idade
 * não precisa ficar exposto numa tela que qualquer colega abre.
 */
export function shortName(fullName: string): string {
  const partes = fullName.trim().split(/\s+/).filter(Boolean);
  const primeiro = partes[0];
  if (!primeiro) return '';

  const sobrenome = partes.length > 1 ? partes[partes.length - 1] : undefined;
  if (!sobrenome) return primeiro;

  return `${primeiro} ${sobrenome.charAt(0).toUpperCase()}.`;
}

/* -------------------------------------------------------------------------- */

/** Dias de `de` até `ate`, em dias civis. Negativo se `ate` já passou. */
function diffDays(de: string, ate: string): number {
  const a = Date.UTC(Number(de.slice(0, 4)), Number(de.slice(5, 7)) - 1, Number(de.slice(8, 10)));
  const b = Date.UTC(
    Number(ate.slice(0, 4)),
    Number(ate.slice(5, 7)) - 1,
    Number(ate.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}
