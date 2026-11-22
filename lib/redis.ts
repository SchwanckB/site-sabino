// Barreira de build: se um Client Component importar este modulo, o build
// falha em vez de arrastar credenciais e consultas do Redis para o bundle.
import 'server-only';

import { Redis } from '@upstash/redis';

import { getRedisCredentials } from '@/lib/redisEnv';

/**
 * Upstash Redis client (REST - funciona em Serverless e Edge).
 *
 * Retorna `null` quando as variaveis nao estao configuradas, para que o site
 * continue renderizando com os dados de `data/seed.ts` em desenvolvimento.
 * Nenhuma chamada a este modulo deve acontecer no cliente.
 */

let client: Redis | null = null;
let initialised = false;

export function getRedis(): Redis | null {
  if (initialised) {
    return client;
  }
  initialised = true;

  const credentials = getRedisCredentials();
  if (!credentials) {
    client = null;
    return client;
  }

  client = new Redis(credentials);
  return client;
}

/** Chaves usadas pela aplicacao. Documentadas em docs/redis-schema.md. */
export const redisKeys = {
  user: (clerkId: string) => `user:${clerkId}`,
  /**
   * Fichas que uma conta administra além da própria.
   *
   * O pai que treina e tem filho na turma infantil: a criança não tem e-mail,
   * então a ficha dela pendura aqui em vez de ganhar um login inventado. Set,
   * e não lista, porque a ordem não importa e o mesmo filho não entra duas
   * vezes.
   */
  dependents: (guardianUserId: string) => `dependents:${guardianUserId}`,
  usersByStatus: (status: string) => `users:by-status:${status}`,
  /**
   * Trava de presença: **um aluno, um dia, uma turma**.
   *
   * Já foi `checkin:${userId}:${isoDate}`, uma por dia. Com ela, quem treinava
   * duas aulas seguidas contava uma presença só — e a chamada marcava o aluno
   * como presente em qualquer turma aberta naquele dia, inclusive numa de
   * outro dia da semana. Presença é por aula realizada, e a trava precisa ter
   * a mesma granularidade.
   *
   * Turma vazia vira `sem-turma`: presença lançada sem turma resolvida ainda
   * precisa de trava, senão o mesmo clique repetido duplicaria.
   */
  checkinLock: (userId: string, isoDate: string, classId: string | null) =>
    `checkin:${userId}:${isoDate}:${classId && classId.length > 0 ? classId : 'sem-turma'}`,
  checkins: (userId: string) => `checkins:${userId}`,
  rankAll: () => 'rank:all',
  rankMonth: (yearMonth: string) => `rank:month:${yearMonth}`,
  rankBelt: (belt: string) => `rank:belt:${belt}`,
  /**
   * Ranking do aluno: por **academia** e por modalidade.
   *
   * Dois recortes, cada um consertando uma injustiça diferente.
   *
   * A modalidade: no ranking único, quem treina jiu **e** MMA soma duas
   * presenças por noite contra uma de quem faz só jiu. O primeiro lugar
   * passava a medir quantas modalidades a pessoa faz, não com que constância
   * ela aparece — e, para quem treina uma só, ficava fora de alcance por
   * aritmética. Ranking que ninguém pode ganhar deixa de ser ranking.
   *
   * A academia: são duas unidades com grades e tamanhos diferentes, e disputar
   * pódio com gente que treina a meia hora de distância não diz nada a
   * ninguém. O recorte é a unidade da **ficha** do aluno — onde ele é de casa
   * —, e não a da aula: a visita de uma noite à outra academia conta para ele
   * no ranking dele, e não o insere no pódio de uma academia que não é a sua.
   *
   * Trocar a unidade da ficha não move o histórico; o recálculo em Relatórios
   * reescreve tudo a partir do histórico e resolve.
   */
  rankUnit: (unit: string) => `rank:u:${unit}`,
  rankUnitMonth: (unit: string, yearMonth: string) => `rank:u:${unit}:month:${yearMonth}`,
  rankUnitModality: (unit: string, modality: string) => `rank:u:${unit}:mod:${modality}`,
  rankUnitModalityMonth: (unit: string, modality: string, yearMonth: string) =>
    `rank:u:${unit}:mod:${modality}:month:${yearMonth}`,
  /**
   * Ranking feminino: as **alunas** da academia, em tudo o que treinam.
   *
   * Não é o ranking da turma feminina de terça e quinta, e a diferença
   * importa. "Feminino" na boca da academia são as mulheres que treinam ali —
   * deixar de fora quem faz a turma mista das 20:30 seria um ranking feminino
   * sem metade das alunas.
   *
   * Também não virou modalidade na grade, embora fosse o caminho mais curto.
   * A turma feminina é jiu-jitsu: promovê-la a modalidade tiraria aquelas
   * presenças do ranking de Jiu-Jitsu, e as alunas passariam a disputar jiu
   * em duas listas separadas por causa do horário em que treinam.
   *
   * O recorte sai do sexo da ficha. Quem não informou não entra — nem aqui
   * nem em lista nenhuma por sexo, que é o único tratamento honesto para um
   * campo que a pessoa escolheu deixar em branco.
   */
  rankUnitFeminino: (unit: string) => `rank:u:${unit}:fem`,
  rankUnitFemininoMonth: (unit: string, yearMonth: string) =>
    `rank:u:${unit}:fem:month:${yearMonth}`,
  rankBeltMonth: (belt: string, yearMonth: string) => `rank:belt:${belt}:month:${yearMonth}`,
  graduationHistory: (userId: string) => `graduation:history:${userId}`,
  graduationDue: () => 'graduation:due',
  payment: (userId: string) => `payment:${userId}`,
  paymentsHistory: (userId: string) => `payments:history:${userId}`,
  paymentsDue: () => 'payments:due',
  scheduleClasses: () => 'schedule:classes',
  /** Aulas personalizadas: a turma em outro horário, numa data só. */
  scheduleOverrides: () => 'schedule:overrides',
  /**
   * Turmas avulsas: a aula que não existe na grade e acontece num dia só.
   *
   * O treino de sábado de manhã aberto nesta semana. Chave separada de
   * `schedule:overrides` porque são coisas diferentes: a exceção muda uma
   * turma que existe, esta cria uma que não existe — e, sem turma na grade,
   * não há matrícula para conferir, logo a aula é aberta a todo aluno ativo
   * da unidade.
   */
  scheduleOneOff: () => 'schedule:oneoff',
  landingPlans: () => 'landing:plans',
  calendarEvents: () => 'calendar:events',
  classLog: (classId: string) => 'class:log:' + classId,
  academySettings: () => 'settings:academy',
  /** Livro-caixa, uma chave por mês: `cash:entries:2026-03`. */
  cashEntries: (month: string) => 'cash:entries:' + month,
  /** Contas fixas, como modelo para lançar o mês. */
  cashRecurring: () => 'cash:recurring',
  /** Meses fechados, que não aceitam mais lançamento. */
  cashClosed: () => 'cash:closed',
  /** Contador do número do recibo. */
  receiptSeq: () => 'finance:receipt:seq',
  /** Histórico de valor da mensalidade de um aluno. */
  planHistory: (userId: string) => 'payments:plan-history:' + userId,
  /** Com quem o professor já falou sobre cobrança, retorno ou aniversário. */
  followup: (kind: string) => 'followup:' + kind,
  qrCurrent: (classId: string) => 'qr:current:' + classId,
  /** Caminho inverso: token lido pela câmera -> turma. */
  qrToken: (token: string) => 'qr:token:' + token,
} as const;
