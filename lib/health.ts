import 'server-only';

import { clerkClient } from '@clerk/nextjs/server';

import { isBlobConfigured, isClerkConfigured } from '@/lib/env';
import { checkBlobUpload } from '@/lib/repositories/documents';
import { getRedis } from '@/lib/redis';
import { getRedisCredentials } from '@/lib/redisEnv';

/**
 * Diagnóstico de verdade dos serviços.
 *
 * Checar se a variável de ambiente existe não prova nada: a chave pode estar
 * errada, o banco pausado ou as duas chaves do Clerk pertencerem a aplicações
 * diferentes. Esse último caso é traiçoeiro — o cadastro funciona (é o
 * navegador falando com a instância da chave publicável) e só o servidor
 * falha, o que chega ao usuário como "algo deu errado" sem explicação.
 *
 * Por isso cada serviço é realmente exercitado, e o erro bruto aparece na tela.
 */

export type CheckState = 'ok' | 'erro' | 'nao_configurado';

export interface HealthCheck {
  readonly service: string;
  readonly state: CheckState;
  readonly detail: string;
  readonly latencyMs: number | null;
}

/**
 * A chave publicável carrega o host da instância em base64.
 * `pk_test_<base64("exemplo-1234.clerk.accounts.dev$")>`
 */
export function clerkInstanceHost(publishableKey: string): string | null {
  const parts = publishableKey.split('_');
  const encoded = parts[2];
  if (!encoded) return null;

  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const host = decoded.replace(/\$$/, '').trim();
    return host.length > 0 ? host : null;
  } catch {
    return null;
  }
}

/** Chama a API do Clerk com a chave secreta — é o que o servidor faz. */
export async function checkClerk(): Promise<HealthCheck> {
  if (!isClerkConfigured()) {
    return {
      service: 'Clerk (login)',
      state: 'nao_configurado',
      detail: 'Defina NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY e CLERK_SECRET_KEY.',
      latencyMs: null,
    };
  }

  const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  const secret = process.env.CLERK_SECRET_KEY ?? '';
  const host = clerkInstanceHost(publishable);

  // pk_test com sk_live (ou o contrário) nunca vai funcionar.
  const publishableAmbiente = publishable.startsWith('pk_live') ? 'live' : 'test';
  const secretAmbiente = secret.startsWith('sk_live') ? 'live' : 'test';

  if (publishableAmbiente !== secretAmbiente) {
    return {
      service: 'Clerk (login)',
      state: 'erro',
      detail: `A chave publicável é "${publishableAmbiente}" e a secreta é "${secretAmbiente}". As duas têm de ser do mesmo ambiente e da mesma aplicação.`,
      latencyMs: null,
    };
  }

  const started = Date.now();

  try {
    const client = await clerkClient();
    const total = await client.users.getCount();

    return {
      service: 'Clerk (login)',
      state: 'ok',
      detail: `Chave secreta válida${host ? ` para ${host}` : ''}. ${total} conta(s) criada(s).`,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      service: 'Clerk (login)',
      state: 'erro',
      detail:
        `A chave secreta foi recusada${host ? ` (a publicável aponta para ${host})` : ''}. ` +
        'Confira se CLERK_SECRET_KEY e NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY saíram da MESMA aplicação no painel do Clerk. ' +
        `Resposta: ${message.slice(0, 200)}`,
      latencyMs: Date.now() - started,
    };
  }
}

/** Faz uma escrita e uma leitura reais, que é o que a aplicação precisa. */
export async function checkRedis(): Promise<HealthCheck> {
  const credentials = getRedisCredentials();

  if (!credentials) {
    return {
      service: 'Upstash Redis',
      state: 'nao_configurado',
      detail:
        'Defina UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, ou ligue a integração Upstash na Vercel (que cria KV_REST_API_URL e KV_REST_API_TOKEN).',
      latencyMs: null,
    };
  }

  const redis = getRedis();
  if (!redis) {
    return {
      service: 'Upstash Redis',
      state: 'erro',
      detail: 'Credenciais presentes, mas o cliente não foi criado.',
      latencyMs: null,
    };
  }

  const started = Date.now();

  try {
    // Escrita + leitura: só ler poderia passar mesmo com token somente-leitura,
    // e a aplicação grava o tempo todo.
    const key = `health:${Date.now()}`;
    await redis.set(key, 'ok', { ex: 30 });
    const value = await redis.get<string>(key);
    await redis.del(key);

    if (value !== 'ok') {
      return {
        service: 'Upstash Redis',
        state: 'erro',
        detail: `Gravou mas leu de volta "${String(value)}".`,
        latencyMs: Date.now() - started,
      };
    }

    return {
      service: 'Upstash Redis',
      state: 'ok',
      detail: `Leitura e escrita funcionando (${credentials.url.replace(/^https?:\/\//, '').slice(0, 28)}…).`,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      service: 'Upstash Redis',
      state: 'erro',
      detail: message.slice(0, 300),
      latencyMs: Date.now() - started,
    };
  }
}

/** Grava e apaga um arquivo de teste — token presente não prova que funciona. */
export async function checkBlob(): Promise<HealthCheck> {
  if (!isBlobConfigured()) {
    return {
      service: 'Vercel Blob (documentos)',
      state: 'nao_configurado',
      detail:
        'Opcional. Sem ele o cadastro funciona, mas sem anexar documento. Crie em Vercel → Storage → Blob.',
      latencyMs: null,
    };
  }

  const started = Date.now();
  const result = await checkBlobUpload();

  return {
    service: 'Vercel Blob (documentos)',
    state: result.ok ? 'ok' : 'erro',
    detail: result.detail,
    latencyMs: Date.now() - started,
  };
}

export async function runHealthChecks(): Promise<HealthCheck[]> {
  const [clerk, redis, blob] = await Promise.all([checkClerk(), checkRedis(), checkBlob()]);
  return [clerk, redis, blob];
}
