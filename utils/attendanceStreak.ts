/**
 * Sequência de treino, em semanas.
 *
 * A medida óbvia seria dias seguidos, e ela mentiria: a grade tem duas ou três
 * aulas por semana, então ninguém treina dois dias seguidos de propósito e a
 * "sequência" morreria toda terça. O que o aluno reconhece como constância é
 * **semana que não faltou** — apareceu ao menos uma vez entre segunda e
 * domingo.
 *
 * A semana corrente conta como viva mesmo sem treino ainda: na segunda-feira
 * de manhã ninguém treinou, e zerar a sequência de quem tem onze semanas
 * seguidas porque o relógio virou é o tipo de número que faz o aluno fechar a
 * tela. Ela só quebra quando uma semana **inteira** passa em branco.
 */
export interface StreakSummary {
  /** Semanas seguidas com ao menos um treino, incluindo a atual. */
  readonly weeks: number;
  /** Maior sequência que o aluno já teve. */
  readonly best: number;
  /** Treinou nesta semana. */
  readonly thisWeek: boolean;
}

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/*
 * A conta é toda em data civil, e por isso usa UTC de propósito.
 *
 * `YYYY-MM-DD` interpretado como meio-dia UTC não muda de dia por fuso nem
 * por horário de verão; somar e subtrair dias dali é aritmética exata. Trazer
 * o fuso de São Paulo para cá seria convidar o erro clássico — a presença de
 * domingo à noite caindo na semana seguinte.
 */
function shiftDays(civilDate: string, days: number): string {
  const base = Date.parse(`${civilDate}T12:00:00Z`);
  return new Date(base + days * UM_DIA_MS).toISOString().slice(0, 10);
}

/** Segunda-feira da semana de uma data civil, como data civil. */
function weekOf(civilDate: string): string {
  const day = new Date(`${civilDate}T12:00:00Z`).getUTCDay();
  // getUTCDay: 0 é domingo. A semana começa na segunda, então domingo recua 6.
  return shiftDays(civilDate, -(day === 0 ? 6 : day - 1));
}

/** A semana anterior a uma segunda-feira, como data civil. */
function previousWeek(monday: string): string {
  return shiftDays(monday, -7);
}

/**
 * Calcula a sequência a partir das datas civis dos check-ins.
 *
 * `dates` pode vir em qualquer ordem e com repetição — duas aulas no mesmo dia
 * são uma presença por aula, mas uma só semana de constância.
 */
export function summarizeStreak(
  dates: readonly string[],
  today: string,
): StreakSummary {
  const semanas = new Set<string>();
  for (const date of dates) {
    if (date.length >= 10) semanas.add(weekOf(date.slice(0, 10)));
  }

  if (semanas.size === 0) {
    return { weeks: 0, best: 0, thisWeek: false };
  }

  const semanaAtual = weekOf(today);
  const thisWeek = semanas.has(semanaAtual);

  // A corrente começa na semana atual se ela tem treino, e na anterior se não
  // tem — a semana que acabou de começar não quebra nada.
  let cursor = thisWeek ? semanaAtual : previousWeek(semanaAtual);
  let weeks = 0;
  while (semanas.has(cursor)) {
    weeks += 1;
    cursor = previousWeek(cursor);
  }

  /*
   * O recorde sai de uma varredura das semanas em ordem.
   *
   * Vale a pena guardar: é o número que dá sentido ao atual. "3 semanas" não
   * diz nada; "3 semanas, seu recorde é 14" diz que o aluno já esteve melhor,
   * e é justamente ele que a academia quer de volta.
   */
  const ordenadas = [...semanas].sort();
  let best = 0;
  let corrida = 0;
  let anterior: string | null = null;

  for (const semana of ordenadas) {
    corrida = anterior !== null && previousWeek(semana) === anterior ? corrida + 1 : 1;
    if (corrida > best) best = corrida;
    anterior = semana;
  }

  return { weeks, best: Math.max(best, weeks), thisWeek };
}
