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
   * Perfil do aluno para os colegas: foto, banner, bio e visibilidade.
   *
   * Hash separado de `user:`, de propósito. A ficha é o que a academia
   * administra — CPF, documento, mensalidade, observação de lesão — e é lida
   * em toda tela do admin. O perfil é o que o aluno escolhe mostrar, e é lido
   * por outros alunos. Separar significa que montar a lista da comunidade não
   * carrega o CPF de ninguém para a memória.
   */
  profile: (studentId: string) => `profile:${studentId}`,
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
