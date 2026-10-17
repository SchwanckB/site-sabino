import 'server-only';

import { randomUUID } from 'node:crypto';

import { getRedis, redisKeys } from '@/lib/redis';
import { asString } from '@/lib/repositories/parse';

/**
 * Token rotativo do QR Code da recepção, **por turma**.
 *
 * O token é aleatório e vive com TTL curto. A validação é **com estado**:
 * compara com o que está no Redis. Isso é de propósito — um token assinado
 * sem estado continuaria válido até expirar mesmo depois de a academia querer
 * invalidá-lo, enquanto aqui basta rotacionar.
 *
 * É o que impede o aluno de bater presença de casa: uma foto do QR mandada no
 * WhatsApp para de funcionar quando o token gira.
 *
 * Cada turma tem o seu token. Antes havia um só para toda a rede, e isso
 * trazia dois problemas: com duas academias, o QR de uma servia na outra; e a
 * turma registrada era deduzida pela janela de horário, o que fica ambíguo
 * quando dois horários se encostam (MMA 19h30 e Jiu-Jitsu 20h30). Com o token
 * amarrado à turma, a presença cai exatamente na aula cujo QR foi lido.
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
  readonly classId: string;
  /** Segundos restantes antes de girar. */
  readonly expiresIn: number;
}

/** Token atual da turma, criando um novo se não houver. */
export async function getCurrentQrToken(classId: string): Promise<QrToken | null> {
  const redis = getRedis();
  if (!redis || classId.length === 0) return null;

  const existing = await redis.get<unknown>(redisKeys.qrCurrent(classId));
  const token = asString(existing);

  if (token.length > 0) {
    const ttl = await redis.ttl(redisKeys.qrCurrent(classId));
    return { token, classId, expiresIn: ttl > 0 ? ttl : qrTtlSeconds() };
  }

  return rotateQrToken(classId);
}

/** Gera um token novo para a turma e descarta o anterior. */
export async function rotateQrToken(classId: string): Promise<QrToken | null> {
  const redis = getRedis();
  if (!redis || classId.length === 0) return null;

  const ttl = qrTtlSeconds();
  const token = `${randomUUID()}.${randomUUID()}`.replace(/-/g, '');

  // O índice reverso do token anterior tem de morrer junto. Sem isso, girar o
  // código deixaria de invalidar o antigo — ele continuaria resolvendo para a
  // turma até o TTL vencer, e a foto do QR mandada no WhatsApp voltaria a
  // funcionar. É justamente o que a rotação existe para impedir.
  const previous = asString(await redis.get<unknown>(redisKeys.qrCurrent(classId)));

  await Promise.all([
    // Duas chaves: uma para exibir o QR da turma, outra para resolver o token
    // de volta à turma na leitura, sem varrer a grade inteira.
    redis.set(redisKeys.qrCurrent(classId), token, { ex: ttl }),
    redis.set(redisKeys.qrToken(token), classId, { ex: ttl }),
    previous.length > 0 ? redis.del(redisKeys.qrToken(previous)) : Promise.resolve(),
  ]);

  return { token, classId, expiresIn: ttl };
}

export type QrValidation =
  | { readonly ok: true; readonly classId: string }
  | { readonly ok: false; readonly reason: 'qr_invalido' | 'qr_expirado' };

/**
 * Valida o token lido pela câmera do aluno e devolve a turma correspondente.
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

  const classId = asString(await redis.get<unknown>(redisKeys.qrToken(clean)));
  if (classId.length === 0) {
    // Token de uma janela anterior, de outra origem, ou já girado.
    return { ok: false, reason: 'qr_expirado' };
  }

  const usedKey = `qr:used:${clean}:${userId}`;
  const first = await redis.set(usedKey, '1', { nx: true, ex: qrTtlSeconds() });
  if (first === null) {
    return { ok: false, reason: 'qr_expirado' };
  }

  return { ok: true, classId };
}
