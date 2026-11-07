import 'server-only';

import { getRedis, redisKeys } from '@/lib/redis';
import type { StudentRecord } from '@/types/domain';

/**
 * O perfil que o aluno mostra aos colegas.
 *
 * Separado da ficha porque é outra coisa: a ficha é o que a academia
 * administra e ninguém mais vê; o perfil é o que o aluno escolhe publicar.
 * Foto, banner, uma linha sobre si, e o que já está no sistema — faixa, graus,
 * tempo de casa, frequência, sequência.
 *
 * O que **não** entra: as turmas que ele faz e o próximo treino. Juntos eles
 * dizem a um estranho onde aquela pessoa vai estar e a que hora, e boa parte
 * da base é de menores. Foi decisão explícita, e vale repetir aqui para que
 * ninguém a reintroduza por parecer um detalhe simpático.
 *
 * Três camadas decidem quem vê:
 *
 *   1. o aluno escolhe `publico` ou `privado` — padrão privado;
 *   2. perfil de menor só vai ao ar com liberação da gestão, porque nem todo
 *      responsável tem conta aqui para dar esse consentimento;
 *   3. a gestão pode ocultar qualquer perfil — é a moderação, e ela vence
 *      qualquer escolha do aluno.
 *
 * E mesmo público, o perfil só é visível para quem tem conta ativa na
 * academia. Não existe perfil aberto na internet.
 */

export type ProfileVisibility = 'publico' | 'privado';

export interface SocialProfile {
  readonly studentId: string;
  /** O que o aluno escolheu. Não é a resposta final — ver `isProfileVisible`. */
  readonly visibility: ProfileVisibility;
  /** Uma linha sobre si. Texto puro, sem link e sem quebra. */
  readonly bio: string;
  /** Caminho no Blob privado. **Nunca** uma URL. */
  readonly avatarKey: string | null;
  readonly bannerKey: string | null;
  /** A gestão liberou este perfil de menor. */
  readonly minorApproved: boolean;
  /** A gestão ocultou. Vence a escolha do aluno. */
  readonly hidden: boolean;
  /** Por quê, para o aluno saber o que corrigir. */
  readonly hiddenReason: string;
  readonly updatedAt: string;
}

export const BIO_MAX = 180;

/** O perfil de quem nunca abriu a tela: privado e vazio. */
export function emptyProfile(studentId: string): SocialProfile {
  return {
    studentId,
    visibility: 'privado',
    bio: '',
    avatarKey: null,
    bannerKey: null,
    minorApproved: false,
    hidden: false,
    hiddenReason: '',
    updatedAt: '',
  };
}

/**
 * Limpa a bio.
 *
 * Uma linha, texto puro: quebras e caracteres de controle viram espaço. Não é
 * só estética — a bio sai renderizada na lista da comunidade, e um campo de
 * texto livre que aceita qualquer coisa é o lugar onde alguém cola um endereço
 * de phishing com formatação convincente.
 */
export function sanitizeBio(raw: string): string {
  return raw
    .replace(new RegExp('[\\u0000-\\u001f\\u007f\\u200b-\\u200f]+', 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, BIO_MAX);
}

/** Menor de idade: a trilha infantil, ou a data de nascimento. */
export function isMinor(student: StudentRecord, now: Date): boolean {
  if (student.category === 'kids') return true;
  if (student.birthDate.length < 10) {
    // Sem data de nascimento tratamos como menor. Errar para o lado de pedir
    // liberação é barato; errar para o outro publica a foto de uma criança.
    return true;
  }

  const [year, month, day] = student.birthDate.split('-').map(Number);
  if (!year || !month || !day) return true;

  const hoje = now.getTime();
  const dezoito = Date.UTC(year + 18, month - 1, day, 12);
  return hoje < dezoito;
}

/**
 * Quem pode ser visto pelos colegas.
 *
 * A ordem das recusas é a ordem da autoridade: moderação da gestão, depois a
 * escolha do aluno, depois a liberação do menor. Aluno que saiu da academia
 * também sai da comunidade — o perfil não é um arquivo público.
 */
export function isProfileVisible(
  profile: SocialProfile | null,
  student: StudentRecord,
  now: Date,
): boolean {
  if (!profile) return false;
  if (profile.hidden) return false;
  if (profile.visibility !== 'publico') return false;
  if (student.status !== 'ativo') return false;
  if (isMinor(student, now) && !profile.minorApproved) return false;
  return true;
}

/**
 * Por que este perfil não está no ar, em uma frase para o próprio aluno.
 *
 * `null` quando está visível. A pergunta "marquei público e ninguém me acha"
 * tem três respostas diferentes e nenhuma delas é óbvia de fora.
 */
export function visibilityNotice(
  profile: SocialProfile,
  student: StudentRecord,
  now: Date,
): string | null {
  if (profile.hidden) {
    return profile.hiddenReason.length > 0
      ? `A gestão ocultou seu perfil: ${profile.hiddenReason}`
      : 'A gestão ocultou seu perfil. Fale com a recepção.';
  }
  if (profile.visibility !== 'publico') {
    return 'Seu perfil está privado. Só você o vê.';
  }
  if (student.status !== 'ativo') {
    return 'Seu cadastro não está ativo, então o perfil não aparece para os colegas.';
  }
  if (isMinor(student, now) && !profile.minorApproved) {
    return 'Perfil de menor de idade precisa da liberação da gestão antes de aparecer para os colegas. Já avisamos a recepção.';
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Leitura e gravação                                                         */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === 'string' ? value : '';
}

function flag(row: Record<string, unknown>, key: string): boolean {
  // O Upstash devolve o que foi gravado; aceitar as duas formas evita que um
  // perfil gravado por uma versão anterior volte com a liberação perdida.
  const value = row[key];
  return value === true || value === '1' || value === 'true';
}

function rowToProfile(studentId: string, row: unknown): SocialProfile | null {
  if (!isRecord(row) || Object.keys(row).length === 0) return null;

  const visibility = str(row, 'visibility') === 'publico' ? 'publico' : 'privado';

  return {
    studentId,
    visibility,
    bio: str(row, 'bio'),
    avatarKey: str(row, 'avatarKey') || null,
    bannerKey: str(row, 'bannerKey') || null,
    minorApproved: flag(row, 'minorApproved'),
    hidden: flag(row, 'hidden'),
    hiddenReason: str(row, 'hiddenReason'),
    updatedAt: str(row, 'updatedAt'),
  };
}

function profileToRow(profile: SocialProfile): Record<string, string> {
  return {
    visibility: profile.visibility,
    bio: profile.bio,
    avatarKey: profile.avatarKey ?? '',
    bannerKey: profile.bannerKey ?? '',
    minorApproved: profile.minorApproved ? '1' : '0',
    hidden: profile.hidden ? '1' : '0',
    hiddenReason: profile.hiddenReason,
    updatedAt: profile.updatedAt,
  };
}

export async function getProfile(studentId: string): Promise<SocialProfile | null> {
  const redis = getRedis();
  if (!redis) return null;

  const row = await redis.hgetall(redisKeys.profile(studentId));
  return rowToProfile(studentId, row);
}

/** Vários de uma vez, numa ida só ao banco. */
export async function getProfiles(
  studentIds: readonly string[],
): Promise<Map<string, SocialProfile>> {
  const found = new Map<string, SocialProfile>();

  const redis = getRedis();
  if (!redis || studentIds.length === 0) return found;

  const pipeline = redis.pipeline();
  for (const id of studentIds) pipeline.hgetall(redisKeys.profile(id));

  const rows = await pipeline.exec<unknown[]>();

  rows.forEach((row, index) => {
    const id = studentIds[index];
    if (!id) return;
    const profile = rowToProfile(id, row);
    if (profile) found.set(id, profile);
  });

  return found;
}

/**
 * Grava o que o **aluno** controla.
 *
 * `minorApproved`, `hidden` e `hiddenReason` ficam de fora de propósito: são
 * decisões da gestão, e um único `hset` com o objeto inteiro deixaria o aluno
 * se liberar sozinho a cada vez que trocasse a bio.
 */
export async function saveOwnProfile(
  studentId: string,
  patch: {
    readonly visibility?: ProfileVisibility;
    readonly bio?: string;
    readonly avatarKey?: string | null;
    readonly bannerKey?: string | null;
  },
  now: Date,
): Promise<SocialProfile> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  const atual = (await getProfile(studentId)) ?? emptyProfile(studentId);

  const proximo: SocialProfile = {
    ...atual,
    ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
    ...(patch.bio !== undefined ? { bio: sanitizeBio(patch.bio) } : {}),
    ...(patch.avatarKey !== undefined ? { avatarKey: patch.avatarKey } : {}),
    ...(patch.bannerKey !== undefined ? { bannerKey: patch.bannerKey } : {}),
    updatedAt: now.toISOString(),
  };

  await redis.hset(redisKeys.profile(studentId), profileToRow(proximo));
  return proximo;
}

/** Grava o que a **gestão** controla: liberação de menor e moderação. */
export async function moderateProfile(
  studentId: string,
  patch: {
    readonly minorApproved?: boolean;
    readonly hidden?: boolean;
    readonly hiddenReason?: string;
  },
  now: Date,
): Promise<SocialProfile> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  const atual = (await getProfile(studentId)) ?? emptyProfile(studentId);

  const proximo: SocialProfile = {
    ...atual,
    ...(patch.minorApproved !== undefined ? { minorApproved: patch.minorApproved } : {}),
    ...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}),
    ...(patch.hiddenReason !== undefined
      ? { hiddenReason: sanitizeBio(patch.hiddenReason) }
      : {}),
    updatedAt: now.toISOString(),
  };

  await redis.hset(redisKeys.profile(studentId), profileToRow(proximo));
  return proximo;
}

/** O perfil some junto com a ficha. */
export async function deleteProfile(studentId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(redisKeys.profile(studentId));
}
