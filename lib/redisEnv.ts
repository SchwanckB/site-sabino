/**
 * Credenciais do Redis, aceitando as duas convenções de nome.
 *
 * A integração Upstash da Vercel cria `KV_REST_API_URL` e `KV_REST_API_TOKEN`;
 * quem cria o banco direto no painel do Upstash recebe `UPSTASH_REDIS_REST_*`.
 * São os mesmos valores — ler as duas evita obrigar o usuário a duplicar
 * variável só para casar com o nome que o código espera.
 *
 * `KV_URL` e `REDIS_URL` são deliberadamente ignorados: falam o protocolo TCP
 * do Redis, e `@upstash/redis` usa a API REST. `KV_REST_API_READ_ONLY_TOKEN`
 * também fica de fora — a aplicação escreve.
 */

export interface RedisCredentials {
  readonly url: string;
  readonly token: string;
}

function firstFilled(...values: (string | undefined)[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return '';
}

export function getRedisCredentials(): RedisCredentials | null {
  const url = firstFilled(
    process.env.UPSTASH_REDIS_REST_URL,
    process.env.KV_REST_API_URL,
  );

  const token = firstFilled(
    process.env.UPSTASH_REDIS_REST_TOKEN,
    process.env.KV_REST_API_TOKEN,
  );

  if (url.length === 0 || token.length === 0) return null;

  return { url, token };
}
