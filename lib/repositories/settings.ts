import 'server-only';

import { getRedis, redisKeys } from '@/lib/redis';
import { asString, isRecord } from '@/lib/repositories/parse';

/**
 * Ajustes da academia que o professor muda sozinho (`settings:academy`).
 *
 * Mora no banco e não em variável de ambiente de propósito: trocar a chave
 * Pix não pode exigir acesso ao painel da hospedagem nem um novo deploy.
 */

export interface AcademySettings {
  /** Chave Pix que entra na mensagem de cobrança. Vazia esconde a linha. */
  readonly pixKey: string;
  /** Nome do titular, para o aluno conferir antes de pagar. */
  readonly pixOwner: string;
}

export const EMPTY_SETTINGS: AcademySettings = { pixKey: '', pixOwner: '' };

const MAX_FIELD = 140;

export async function getAcademySettings(): Promise<AcademySettings> {
  const redis = getRedis();
  if (!redis) return EMPTY_SETTINGS;

  try {
    const raw = await redis.get<unknown>(redisKeys.academySettings());
    if (!isRecord(raw)) return EMPTY_SETTINGS;

    return {
      pixKey: asString(raw['pixKey']).slice(0, MAX_FIELD),
      pixOwner: asString(raw['pixOwner']).slice(0, MAX_FIELD),
    };
  } catch (error) {
    console.error('[settings] falha ao ler settings:academy', error);
    return EMPTY_SETTINGS;
  }
}

export async function saveAcademySettings(
  input: AcademySettings,
  now: Date,
): Promise<AcademySettings> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  const settings: AcademySettings = {
    pixKey: input.pixKey.trim().slice(0, MAX_FIELD),
    pixOwner: input.pixOwner.trim().slice(0, MAX_FIELD),
  };

  await redis.set(
    redisKeys.academySettings(),
    JSON.stringify({ ...settings, updatedAt: now.toISOString() }),
  );

  return settings;
}
