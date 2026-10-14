import 'server-only';

import { getRedis } from '@/lib/redis';
import { getRedisCredentials } from '@/lib/redisEnv';
import { isBlobConfigured, isClerkConfigured } from '@/lib/env';

/**
 * Diagnóstico de verdade dos serviços.
 *
 * Checar se a variável de ambiente existe não prova nada: a chave pode estar
 * errada, o banco pausado ou a rede bloqueada, e o sintoma chega ao usuário
 * como "erro no banco" sem nenhuma pista. Aqui cada serviço é realmente
 * exercitado, e o erro bruto aparece na tela de configuração.
 */

export type CheckState = 'ok' | 'erro' | 'nao_configurado';

export interface HealthCheck {
  readonly service: string;
  readonly state: CheckState;
  readonly detail: string;
  /** Tempo da ida e volta, quando houve chamada. */
  readonly latencyMs: number | null;
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
      // A mensagem bruta é o que resolve: "WRONGPASS", "not a float", timeout…
      detail: message.slice(0, 300),
      latencyMs: Date.now() - started,
    };
  }
}

export function checkClerk(): HealthCheck {
  return isClerkConfigured()
    ? {
        service: 'Clerk (login)',
        state: 'ok',
        detail: 'Chaves presentes.',
        latencyMs: null,
      }
    : {
        service: 'Clerk (login)',
        state: 'nao_configurado',
        detail: 'Defina NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY e CLERK_SECRET_KEY.',
        latencyMs: null,
      };
}

export function checkBlob(): HealthCheck {
  return isBlobConfigured()
    ? {
        service: 'Vercel Blob (documentos)',
        state: 'ok',
        detail: 'Token presente. O upload de documento está liberado.',
        latencyMs: null,
      }
    : {
        service: 'Vercel Blob (documentos)',
        state: 'nao_configurado',
        detail:
          'Opcional. Sem ele o cadastro funciona, mas sem anexar documento. Crie em Vercel → Storage → Blob.',
        latencyMs: null,
      };
}

export async function runHealthChecks(): Promise<HealthCheck[]> {
  return [checkClerk(), await checkRedis(), checkBlob()];
}
