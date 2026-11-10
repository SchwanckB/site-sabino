import { daysBetween } from './datetime';

/**
 * Risco de evasão, detectado pela **queda** de frequência.
 *
 * O painel já lista quem não aparece há 21 dias. O problema é que aos 21 dias
 * a pessoa já saiu: a conversa vira resgate, não retenção. Quem treinava três
 * vezes por semana e caiu para uma há dez dias não aparecia em lugar nenhum —
 * e é exatamente quem ainda dá para segurar.
 *
 * A regra compara as últimas duas semanas com as quatro anteriores. Não é a
 * ausência absoluta que acusa, é a mudança de padrão: quem sempre treinou uma
 * vez por semana e continua assim não está em risco, enquanto quem fazia três
 * e fez uma está.
 */

export type RiskLevel = 'nenhum' | 'atencao' | 'alto';

export interface RiskInput {
  /** Datas de check-in (`YYYY-MM-DD`), em qualquer ordem. */
  readonly dates: readonly string[];
  /** Hoje, `YYYY-MM-DD`. */
  readonly today: string;
  /** `true` quando a mensalidade está em dia. */
  readonly paidUp: boolean;
}

export interface Risk {
  readonly level: RiskLevel;
  /** A frase que o professor lê na lista. */
  readonly reason: string;
  /** Ordena a lista: maior é mais urgente. `0` quando não há risco. */
  readonly weight: number;
}

const JANELA = 14;
const BASE = 28;

/**
 * Base mínima para existir "queda".
 *
 * Quem fez menos de três treinos em quatro semanas nunca teve padrão
 * estabelecido — acusar queda aí encheria a lista de quem acabou de entrar e
 * de quem sempre foi esporádico, e uma lista que acusa todo mundo não é lida.
 */
const BASE_MINIMA = 3;

const SEM_RISCO: Risk = { level: 'nenhum', reason: '', weight: 0 };

/** `3` para "1,5 por semana" virar "1,5x". Uma casa, e sem zero à direita. */
function porSemana(contagem: number, dias: number): string {
  const taxa = (contagem / dias) * 7;
  return (Math.round(taxa * 10) / 10).toString().replace('.', ',');
}

export function assessRetentionRisk({ dates, today, paidUp }: RiskInput): Risk {
  if (dates.length === 0) return SEM_RISCO;

  // `daysBetween` devolve negativo para data futura; ela não conta como treino
  // passado e entraria como "0 dias atrás", inflando a janela recente.
  const idades = dates
    .map((date) => daysBetween(today, date))
    .filter((idade) => idade >= 0)
    .sort((a, b) => a - b);

  if (idades.length === 0) return SEM_RISCO;

  const desdeUltimo = idades[0] as number;
  const recentes = idades.filter((idade) => idade < JANELA).length;
  const anteriores = idades.filter((idade) => idade >= JANELA && idade < JANELA + BASE).length;

  if (anteriores < BASE_MINIMA) return SEM_RISCO;

  const taxaBase = porSemana(anteriores, BASE);

  // Parou de vez: era regular e não apareceu nenhuma vez em duas semanas.
  if (recentes === 0) {
    return {
      level: 'alto',
      reason: `treinava ${taxaBase}x por semana e não aparece há ${desdeUltimo} dias`,
      weight: 1000 + desdeUltimo,
    };
  }

  /*
   * Caiu pela metade ou mais.
   *
   * A base de 28 dias é comparada com a janela de 14 na mesma escala — sem
   * normalizar, quatro treinos em quatro semanas pareceriam o dobro de dois em
   * duas, quando é a mesma frequência.
   */
  const esperado = (anteriores * JANELA) / BASE;
  if (recentes <= esperado / 2) {
    return {
      level: 'atencao',
      reason: `caiu de ${taxaBase}x para ${porSemana(recentes, JANELA)}x por semana`,
      weight: 500 + Math.round(((esperado - recentes) / esperado) * 100),
    };
  }

  /*
   * Pagou e parou de vir.
   *
   * O sinal mais revelador de todos, e o que menos aparece: quem está
   * inadimplente some por motivo conhecido, mas quem pagou a mensalidade e
   * deixou de aparecer está desistindo de algo que já comprou.
   */
  if (paidUp && desdeUltimo >= 10) {
    return {
      level: 'atencao',
      reason: `mensalidade em dia e não aparece há ${desdeUltimo} dias`,
      weight: 400 + desdeUltimo,
    };
  }

  return SEM_RISCO;
}
