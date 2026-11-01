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

/**
 * O que a pessoa anexou no cadastro.
 *
 * Nem todo mundo se sente à vontade enviando RG ou CNH para uma academia, e
 * barrar a matrícula por isso custa aluno. A foto do rosto passa a valer como
 * alternativa — serve para a recepção reconhecer quem chega, que é o uso
 * cotidiano do anexo.
 *
 * O tipo é gravado junto porque as duas coisas não se equivalem: o professor
 * precisa saber, ao aprovar, se tem um documento de identidade em mãos ou só
 * um retrato. Em matrícula de menor isso muda a conversa com o responsável.
 */
export type DocumentKind = 'documento' | 'foto';

export const DOCUMENT_KINDS: readonly DocumentKind[] = ['documento', 'foto'];

export const DOCUMENT_KIND_LABELS: Readonly<Record<DocumentKind, string>> = {
  documento: 'Documento com foto (RG, CNH ou certidão)',
  foto: 'Foto do rosto do aluno',
};

/** Rótulo curto, para listas e crachás do painel. */
export const DOCUMENT_KIND_SHORT: Readonly<Record<DocumentKind, string>> = {
  documento: 'Documento',
  foto: 'Foto do aluno',
};

/** Normaliza o que veio do formulário ou do banco. */
export function toDocumentKind(value: unknown): DocumentKind {
  return value === 'foto' ? 'foto' : 'documento';
}
