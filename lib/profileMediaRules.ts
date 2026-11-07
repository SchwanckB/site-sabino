/**
 * Regras da foto e do banner do perfil, compartilhadas entre cliente e servidor.
 *
 * Fora de `lib/repositories/profileMedia.ts` pelo mesmo motivo de
 * `documentRules`: aquele módulo é `server-only` (carrega o SDK do Blob e o
 * `sharp`), e o formulário roda no navegador. A validação do cliente é
 * conveniência; a que vale é a do servidor.
 */

export const MAX_PROFILE_IMAGE_BYTES = 8 * 1024 * 1024;

export const ACCEPTED_PROFILE_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  // HEIC é o padrão do iPhone. Sem ele, metade da academia não consegue
  // enviar a própria foto sem antes descobrir como converter.
  'image/heic',
  'image/heif',
] as const;

export const PROFILE_IMAGE_LABEL = 'JPG, PNG, WEBP ou HEIC, até 8 MB';

export const PROFILE_IMAGE_ACCEPT_ATTR = [
  ...ACCEPTED_PROFILE_IMAGE_TYPES,
  // Alguns navegadores não reconhecem o tipo do HEIC vindo da galeria; a
  // extensão no `accept` evita o arquivo aparecer cinza no seletor.
  '.heic',
  '.heif',
].join(',');

/** O que a imagem vira depois do corte. */
export type ProfileImageKind = 'avatar' | 'banner';

/**
 * Tamanho de saída de cada peça.
 *
 * Toda imagem é reprocessada: a foto de 8 MB que sai do celular, servida em
 * cada linha da lista da comunidade, queimaria o plano de dados do aluno — e
 * reprocessar também descarta os metadados do arquivo original, onde vem a
 * coordenada de GPS que o celular grava sem ninguém pedir.
 */
export const PROFILE_IMAGE_SIZES: Record<
  ProfileImageKind,
  { readonly width: number; readonly height: number }
> = {
  avatar: { width: 512, height: 512 },
  banner: { width: 1600, height: 500 },
};
