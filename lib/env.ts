/**
 * Detecção de serviços configurados.
 *
 * O site precisa continuar no ar mesmo sem Clerk, Redis ou Blob. A landing
 * page nunca depende de nenhum deles; as rotas logadas, em vez de quebrar,
 * mandam o visitante para `/configurar` com a lista do que falta.
 */

import { getRedisCredentials } from '@/lib/redisEnv';

export interface ServiceStatus {
  readonly clerk: boolean;
  readonly redis: boolean;
  readonly blob: boolean;
}

function filled(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isClerkConfigured(): boolean {
  return (
    filled(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
    filled(process.env.CLERK_SECRET_KEY)
  );
}

export function isRedisConfigured(): boolean {
  return getRedisCredentials() !== null;
}

export function isBlobConfigured(): boolean {
  return filled(process.env.BLOB_READ_WRITE_TOKEN);
}

export function getServiceStatus(): ServiceStatus {
  return {
    clerk: isClerkConfigured(),
    redis: isRedisConfigured(),
    blob: isBlobConfigured(),
  };
}

/** `true` quando o app logado tem o mínimo para funcionar. */
export function isAppReady(): boolean {
  const status = getServiceStatus();
  return status.clerk && status.redis;
}

export interface MissingService {
  readonly key: string;
  readonly label: string;
  readonly envVars: readonly string[];
  readonly where: string;
  readonly required: boolean;
}

/** Lista o que falta configurar, para a tela `/configurar`. */
export function listMissingServices(): MissingService[] {
  const status = getServiceStatus();
  const missing: MissingService[] = [];

  if (!status.clerk) {
    missing.push({
      key: 'clerk',
      label: 'Clerk — login e cadastro',
      envVars: ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY'],
      where: 'clerk.com → crie uma aplicação → API Keys',
      required: true,
    });
  }

  if (!status.redis) {
    missing.push({
      key: 'redis',
      label: 'Upstash Redis — banco de dados',
      envVars: [
        'UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN',
        'ou KV_REST_API_URL + KV_REST_API_TOKEN',
      ],
      where:
        'Vercel → Storage → Upstash (cria as KV_* sozinho), ou upstash.com → Create Database (sa-east-1) → REST API',
      required: true,
    });
  }

  if (!status.blob) {
    missing.push({
      key: 'blob',
      label: 'Vercel Blob — documentos dos alunos',
      envVars: ['BLOB_READ_WRITE_TOKEN'],
      where: 'Vercel → Storage → Create Blob Store',
      required: false,
    });
  }

  return missing;
}
