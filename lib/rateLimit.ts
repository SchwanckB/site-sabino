import 'server-only';

import { getRedis } from '@/lib/redis';

/**
 * Limite de tentativas por janela de tempo, no Redis.
 *
 * Server Actions são endpoints HTTP públicos. Sem limite, uma conta autenticada
 * podia chamar o pré-cadastro em laço e empurrar arquivos de 5 MB para o Blob
 * sem teto — custo e armazenamento — e o check-in relia a grade sem cache a
 * cada tentativa, virando um amplificador de carga no Redis de graça.
 *
 * Janela fixa, não deslizante: `INCR` com `EXPIRE` no primeiro acerto. Uma
 * janela fixa deixa passar um pico na virada, e aqui isso não importa — o alvo
 * é abuso em laço, não precisão de cota.
 *
 * Sem Redis configurado, **libera**. Esta trava protege custo, não autorização:
 * nenhuma permissão depende dela, e derrubar a matrícula inteira porque o
 * contador não está disponível seria o remédio pior que a doença.
 */

export interface RateLimitResult {
  readonly allowed: boolean;
  /** Tentativas restantes na janela. */
  readonly remaining: number;
  /** Segundos até a janela virar. `0` quando não há limite ativo. */
  readonly retryAfter: number;
}

const ALLOWED: RateLimitResult = { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfter: 0 };

/**
 * Consome uma tentativa de `action` para `identity`.
 *
 * A chave inclui a identidade para que o abuso de uma conta não bloqueie as
 * outras — limitar por ação global deixaria um aluno travar a matrícula de
 * todos.
 */
export async function consumeRateLimit(
  action: string,
  identity: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) return ALLOWED;

  const key = `ratelimit:${action}:${identity}`;

  try {
    const count = await redis.incr(key);

    // Só o primeiro acerto define o TTL; os seguintes não podem reiniciar a
    // janela, senão um laço contínuo nunca a deixaria virar.
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }

    if (count > limit) {
      const ttl = await redis.ttl(key);
      return {
        allowed: false,
        remaining: 0,
        // TTL negativo significa chave sem expiração registrada: assume a
        // janela cheia em vez de devolver "tente de novo em -1 segundos".
        retryAfter: ttl > 0 ? ttl : windowSeconds,
      };
    }

    return { allowed: true, remaining: limit - count, retryAfter: 0 };
  } catch (error) {
    // Falha do contador não pode barrar a matrícula de ninguém.
    console.error('[rateLimit] contador indisponível', error);
    return ALLOWED;
  }
}

/** Texto de recusa com o tempo de espera em linguagem de gente. */
export function rateLimitMessage(retryAfter: number): string {
  if (retryAfter >= 120) {
    return `Muitas tentativas em sequência. Espere ${Math.ceil(retryAfter / 60)} minutos e tente de novo.`;
  }
  if (retryAfter > 1) {
    return `Muitas tentativas em sequência. Espere ${retryAfter} segundos e tente de novo.`;
  }
  return 'Muitas tentativas em sequência. Espere um instante e tente de novo.';
}
