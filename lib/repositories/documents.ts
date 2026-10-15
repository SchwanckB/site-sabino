import 'server-only';

import {
  BlobAccessError,
  BlobClientTokenExpiredError,
  BlobContentTypeNotAllowedError,
  BlobFileTooLargeError,
  BlobServiceNotAvailable,
  BlobServiceRateLimited,
  BlobStoreNotFoundError,
  BlobStoreSuspendedError,
  del,
  get,
  put,
} from '@vercel/blob';

import { ACCEPTED_DOCUMENT_LABEL, ACCEPTED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from '@/lib/documentRules';
import { isBlobConfigured } from '@/lib/env';

/**
 * Documento de identidade do aluno no Vercel Blob.
 *
 * Gravado com `access: 'private'`: o arquivo não tem URL pública nenhuma, nem
 * mesmo uma impossível de adivinhar. A leitura exige o token do servidor, e o
 * administrador só enxerga o documento através de uma rota autenticada que
 * transmite os bytes.
 *
 * O Redis guarda apenas o `pathname` — nunca uma URL.
 */

export type DocumentUploadResult =
  | { readonly ok: true; readonly blobKey: string }
  | { readonly ok: false; readonly error: string };

function extensionFor(type: string): string {
  switch (type) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'application/pdf':
      return 'pdf';
    default:
      return 'bin';
  }
}

/**
 * Traduz a falha do Blob em algo acionável.
 *
 * Uma mensagem genérica como "não foi possível enviar" deixa o aluno travado e
 * a academia sem saber o que corrigir — foi o que aconteceu. Cada causa comum
 * aqui tem um encaminhamento diferente.
 */
function describeBlobError(error: unknown): string {
  if (error instanceof BlobAccessError) {
    return 'O armazenamento recusou o envio (token sem permissão). A academia precisa revisar o BLOB_READ_WRITE_TOKEN.';
  }
  if (error instanceof BlobStoreNotFoundError) {
    return 'O armazenamento de arquivos não foi encontrado. A academia precisa criar o Blob Store na Vercel.';
  }
  if (error instanceof BlobStoreSuspendedError) {
    return 'O armazenamento de arquivos está suspenso. Avise a academia.';
  }
  if (error instanceof BlobClientTokenExpiredError) {
    return 'A credencial do armazenamento expirou. Avise a academia.';
  }
  if (error instanceof BlobFileTooLargeError) {
    return `Arquivo grande demais. O limite é ${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB.`;
  }
  if (error instanceof BlobContentTypeNotAllowedError) {
    return `Formato não aceito. Envie ${ACCEPTED_DOCUMENT_LABEL}.`;
  }
  if (error instanceof BlobServiceRateLimited) {
    return 'Muitos envios em sequência. Espere um minuto e tente de novo.';
  }
  if (error instanceof BlobServiceNotAvailable) {
    return 'O armazenamento está indisponível no momento. Tente novamente em alguns minutos.';
  }

  const message = error instanceof Error ? error.message : String(error);
  return `Falha ao enviar o arquivo: ${message.slice(0, 160)}`;
}

/** Valida no servidor — nunca confie no `accept` do input. */
export function validateDocument(file: File): string | null {
  if (file.size === 0) {
    return 'Selecione um arquivo.';
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return `Arquivo muito grande. O limite é 5 MB (o seu tem ${(file.size / 1024 / 1024).toFixed(1)} MB).`;
  }
  if (!(ACCEPTED_DOCUMENT_TYPES as readonly string[]).includes(file.type)) {
    return `Formato não aceito. Envie ${ACCEPTED_DOCUMENT_LABEL}.`;
  }
  return null;
}

export async function uploadDocument(
  userId: string,
  file: File,
): Promise<DocumentUploadResult> {
  if (!isBlobConfigured()) {
    return { ok: false, error: 'Armazenamento de documentos não configurado.' };
  }

  const problem = validateDocument(file);
  if (problem) {
    return { ok: false, error: problem };
  }

  try {
    const blob = await put(
      `documentos/${userId}/documento.${extensionFor(file.type)}`,
      file,
      {
        access: 'private',
        // Sem sufixo, reenviar o documento colidiria com o anterior e o SDK
        // lançaria erro em vez de substituir.
        addRandomSuffix: true,
        contentType: file.type,
      },
    );

    return { ok: true, blobKey: blob.pathname };
  } catch (error) {
    console.error('[documents] falha no upload', error);
    return { ok: false, error: describeBlobError(error) };
  }
}

export interface OpenedDocument {
  readonly stream: ReadableStream;
  readonly contentType: string;
}

/**
 * Abre o documento para a rota autenticada do admin.
 * **Uso exclusivo do servidor** — o conteúdo nunca vira URL para o navegador.
 */
export async function openDocument(blobKey: string): Promise<OpenedDocument | null> {
  if (!isBlobConfigured() || blobKey.length === 0) return null;

  try {
    const result = await get(blobKey, { access: 'private' });
    if (!result || !('stream' in result) || !result.stream) return null;

    return {
      stream: result.stream,
      contentType: result.headers?.get('content-type') ?? 'application/octet-stream',
    };
  } catch (error) {
    console.error('[documents] falha ao abrir', error);
    return null;
  }
}

export async function deleteDocument(blobKey: string): Promise<void> {
  if (!isBlobConfigured() || blobKey.length === 0) return;

  try {
    await del(blobKey);
  } catch (error) {
    console.error('[documents] falha ao remover', error);
  }
}

/**
 * Grava e apaga um arquivo mínimo, para o diagnóstico.
 * Conferir só a presença do token esconde token inválido e store ausente.
 */
export async function checkBlobUpload(): Promise<{ ok: boolean; detail: string }> {
  if (!isBlobConfigured()) {
    return {
      ok: false,
      detail:
        'Opcional. Sem ele o cadastro funciona, mas sem anexar documento. Crie em Vercel → Storage → Blob.',
    };
  }

  const path = `health/${Date.now()}.txt`;

  try {
    const blob = await put(path, 'ok', {
      access: 'private',
      addRandomSuffix: true,
      contentType: 'text/plain',
    });
    await del(blob.pathname);

    return { ok: true, detail: 'Envio e remoção de arquivo funcionando (acesso privado).' };
  } catch (error) {
    return { ok: false, detail: describeBlobError(error) };
  }
}
