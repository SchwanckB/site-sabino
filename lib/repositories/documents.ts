import 'server-only';

import { del, head, put } from '@vercel/blob';

import {
  ACCEPTED_DOCUMENT_LABEL,
  ACCEPTED_DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
} from '@/lib/documentRules';
import { isBlobConfigured } from '@/lib/env';

/**
 * Documento de identidade do aluno no Vercel Blob.
 *
 * **Como a privacidade é garantida.** O Vercel Blob entrega URLs públicas, mas
 * com sufixo aleatório — impossíveis de adivinhar. A proteção real vem de
 * nunca deixar essa URL sair do servidor: o Redis guarda só o `pathname`, e o
 * admin vê o arquivo através de uma rota autenticada que transmite os bytes.
 * Assim, mesmo quem souber o ID do aluno não alcança o documento sem sessão de
 * ADMIN.
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
        access: 'public',
        // Sufixo aleatório: a URL deixa de ser derivável a partir do ID.
        addRandomSuffix: true,
        contentType: file.type,
      },
    );

    return { ok: true, blobKey: blob.pathname };
  } catch (error) {
    console.error('[documents] falha no upload', error);
    return { ok: false, error: 'Não foi possível enviar o arquivo. Tente novamente.' };
  }
}

/**
 * URL interna do documento. **Uso exclusivo do servidor** — nunca devolva
 * isto em props de componente nem em JSON para o navegador.
 */
export async function resolveDocumentUrl(blobKey: string): Promise<string | null> {
  if (!isBlobConfigured() || blobKey.length === 0) return null;

  try {
    const metadata = await head(blobKey);
    return metadata.url;
  } catch {
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
