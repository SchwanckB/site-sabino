/**
 * Regras do documento de identidade, compartilhadas entre cliente e servidor.
 *
 * Fica fora de `lib/repositories/documents.ts` de propósito: aquele módulo é
 * `server-only` (carrega o SDK do Blob e o token de escrita), e o formulário de
 * cadastro roda no navegador. Só as regras atravessam a fronteira — o acesso ao
 * armazenamento, não.
 *
 * A validação do cliente é conveniência; a que vale é a do servidor, em
 * `validateDocument`.
 */

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export const ACCEPTED_DOCUMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export const ACCEPTED_DOCUMENT_LABEL = 'JPG, PNG, WEBP ou PDF, até 5 MB';

/** Valor do `accept` do input de arquivo. */
export const DOCUMENT_ACCEPT_ATTR = ACCEPTED_DOCUMENT_TYPES.join(',');
