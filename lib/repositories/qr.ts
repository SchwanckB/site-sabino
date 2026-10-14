import 'server-only';

import { randomUUID } from 'node:crypto';

import { getRedis, redisKeys } from '@/lib/redis';
import { asString } from '@/lib/repositories/parse';

/**
 * Token rotativo do QR Code da recepção.
 *
 * O token é aleatório e vive em `qr:current` com TTL curto. A validação é
 * **com estado**: compara com o que está no Redis. Isso é de propósito — um
 * token assinado sem estado continuaria válido até expirar mesmo depois de a
 * academia querer invalidá-lo, enquanto aqui basta rotacionar.
 *
 * É o que impede o aluno de bater presença de casa: uma foto do QR mandada no
 * WhatsApp para de funcionar quando o token gira.
 */

/** Padrão de 2 minutos; ajustável por `QR_TOKEN_TTL_SECONDS`. */
export const DEFAULT_QR_TTL_SECONDS = 120;

export function qrTtlSeconds(): number {
  const raw = Number(process.env.QR_TOKEN_TTL_SECONDS);
  if (!Number.isFinite(raw) || raw < 30) return DEFAULT_QR_TTL_SECONDS;
  return Math.min(Math.trunc(raw), 900);
}

export interface QrToken {
  readonly token: string;
  /** Segundos restantes antes de girar. */
  readonly expiresIn: number;
}

/** Token atual, criando um novo se não houver. */
export async function getCurrentQrToken(): Promise<QrToken | null> {
  const redis = getRedis();
  if (!redis) return null;

  const existing = await redis.get<unknown>(redisKeys.qrCurrent());
  const token = asString(existing);

  if (token.length > 0) {
    const ttl = await redis.ttl(redisKeys.qrCurrent());
    return { token, expiresIn: ttl > 0 ? ttl : qrTtlSeconds() };
  }

  return rotateQrToken();
}

/** Gera um token novo e descarta o anterior. */
export async function rotateQrToken(): Promise<QrToken | null> {
  const redis = getRedis();
  if (!redis) return null;

  const ttl = qrTtlSeconds();
  const token = `${randomUUID()}.${randomUUID()}`.replace(/-/g, '');

  await redis.set(redisKeys.qrCurrent(), token, { ex: ttl });

  return { token, expiresIn: ttl };
}

export type QrValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'qr_invalido' | 'qr_expirado' };

/**
 * Valida o token lido pela câmera do aluno.
 *
 * Também marca o par token+aluno como usado, para que um mesmo QR não registre
 * duas presenças na mesma janela (a trava diária já cobre o caso geral, mas
 * esta é a defesa específica da janela do token).
 */
export async function validateQrToken(
  token: string,
  userId: string,
): Promise<QrValidation> {
  const redis = getRedis();
  if (!redis) return { ok: false, reason: 'qr_invalido' };

  const clean = token.trim();
  if (clean.length === 0 || clean.length > 128) {
    return { ok: false, reason: 'qr_invalido' };
  }

  const current = asString(await redis.get<unknown>(redisKeys.qrCurrent()));
  if (current.length === 0) {
    return { ok: false, reason: 'qr_expirado' };
  }
  if (current !== clean) {
    // Token de uma janela anterior ou de outra origem.
    return { ok: false, reason: 'qr_expirado' };
  }

  const usedKey = `qr:used:${clean}:${userId}`;
  const first = await redis.set(usedKey, '1', { nx: true, ex: qrTtlSeconds() });
  if (first === null) {
    return { ok: false, reason: 'qr_expirado' };
  }

  return { ok: true };
}
