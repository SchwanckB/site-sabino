import 'server-only';

import { createHmac } from 'node:crypto';

import { getRedis, redisKeys } from '@/lib/redis';
import { asString } from '@/lib/repositories/parse';

/**
 * Código de presença **fixo** por turma.
 *
 * O código não gira mais. A academia precisa imprimir o QR e colar na parede
 * da turma, e um código rotativo obriga a manter uma tela ligada na recepção
 * durante todo o treino — o que nem sempre acontece.
 *
 * O preço dessa escolha é conhecido e aceito: uma foto do cartaz passa a
 * servir para bater presença de casa. O que continua segurando o check-in são
 * as outras três travas:
 *
 *   1. **uma presença por dia por aluno**, garantida por `SET NX` atômico;
 *   2. **janela de horário da turma** — fora dela o check-in é recusado;
 *   3. **matrícula na turma** — o QR da kids não serve para quem não é da kids.
 *
 * Quem quisesse burlar teria de marcar presença exatamente no horário da aula
 * em que está matriculado, uma vez por dia. É uma fraude possível, mas o
 * professor vê o tatame; a chamada manual continua existindo para corrigir.
 *
 * O código é derivado por HMAC do id da turma com `QR_TOKEN_SECRET`, e não
 * sorteado: assim ele é estável entre deploys e entre regiões, sem precisar
 * ser guardado em lugar nenhum. Trocar o segredo invalida todos os cartazes
 * de uma vez — é essa a alavanca se um código vazar.
 */

export interface QrToken {
  readonly token: string;
  readonly classId: string;
}

function secret(): string {
  const value = process.env.QR_TOKEN_SECRET ?? '';
  return value.length >= 16 ? value : '';
}

/** Código fixo da turma. `null` quando falta o segredo ou a turma. */
export function qrTokenFor(classId: string): string | null {
  const key = secret();
  if (key.length === 0 || classId.length === 0) return null;

  return createHmac('sha256', key).update(`checkin:${classId}`).digest('base64url').slice(0, 32);
}

/** Código atual da turma, para desenhar o QR. */
export function getCurrentQrToken(classId: string): QrToken | null {
  const token = qrTokenFor(classId);
  return token === null ? null : { token, classId };
}

export type QrValidation =
  | { readonly ok: true; readonly classId: string }
  | { readonly ok: false; readonly reason: 'qr_invalido' };

/**
 * Resolve o código lido pela câmera de volta para a turma.
 *
 * Percorre a grade comparando o HMAC de cada turma. São dezenas de turmas, não
 * milhares — e evita manter um índice no banco que poderia sair de sincronia
 * com a grade.
 */
export function validateQrToken(
  token: string,
  classIds: readonly string[],
): QrValidation {
  const clean = token.trim();
  if (clean.length === 0 || clean.length > 128) {
    return { ok: false, reason: 'qr_invalido' };
  }

  for (const classId of classIds) {
    if (qrTokenFor(classId) === clean) {
      return { ok: true, classId };
    }
  }

  return { ok: false, reason: 'qr_invalido' };
}

/**
 * Apaga os códigos rotativos que ficaram no banco do modelo anterior.
 *
 * Só serve para limpeza; nada no fluxo atual lê essas chaves.
 */
export async function clearLegacyTokens(classId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const previous = asString(await redis.get<unknown>(redisKeys.qrCurrent(classId)));
  await redis.del(redisKeys.qrCurrent(classId));
  if (previous.length > 0) await redis.del(redisKeys.qrToken(previous));
}
