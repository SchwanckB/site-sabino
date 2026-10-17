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
  usersByStatus: (status: string) => `users:by-status:${status}`,
  checkinLock: (userId: string, isoDate: string) => `checkin:${userId}:${isoDate}`,
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
  landingPlans: () => 'landing:plans',
  calendarEvents: () => 'calendar:events',
  classLog: (classId: string) => 'class:log:' + classId,
  academySettings: () => 'settings:academy',
  qrCurrent: (classId: string) => 'qr:current:' + classId,
  /** Caminho inverso: token lido pela câmera -> turma. */
  qrToken: (token: string) => 'qr:token:' + token,
} as const;
