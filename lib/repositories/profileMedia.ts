import 'server-only';

import { del, get, put } from '@vercel/blob';

import { isBlobConfigured } from '@/lib/env';
import {
  ACCEPTED_PROFILE_IMAGE_TYPES,
  MAX_PROFILE_IMAGE_BYTES,
  PROFILE_IMAGE_LABEL,
  PROFILE_IMAGE_SIZES,
  type ProfileImageKind,
} from '@/lib/profileMediaRules';

/**
 * Foto e banner do perfil no Vercel Blob.
 *
 * Gravados com `access: 'private'`, como o documento de identidade — e isto é
 * a decisão mais importante deste arquivo. O caminho fácil seria `access:
 * 'public'` e colocar a URL direto no `<img>`: um campo a menos, uma rota a
 * menos, e o CDN da Vercel entregando de graça.
 *
 * Só que URL pública do Blob é pública para sempre e para qualquer um. Vale
 * mesmo depois de o aluno marcar o perfil como privado, mesmo depois de a
 * gestão ocultar, mesmo depois de a ficha ser apagada — basta alguém ter
 * copiado o endereço. Numa base em que boa parte dos alunos é criança, isso
 * não é um detalhe de arquitetura: é a diferença entre "a foto do meu filho
 * aparece para os colegas da academia" e "a foto do meu filho está na
 * internet".
 *
 * Então a imagem sai por uma rota que confere a sessão e a visibilidade a cada
 * requisição. Ocultar o perfil apaga o acesso no mesmo instante.
 *
 * Toda imagem é reprocessada com `sharp` antes de subir. Dois ganhos: a foto
 * de 8 MB do celular vira uns 60 KB — a lista da comunidade carrega dezenas
 * delas —, e os metadados do original são descartados, inclusive a coordenada
 * de GPS que o celular grava sem ninguém pedir.
 */

export type ProfileImageResult =
  | { readonly ok: true; readonly blobKey: string }
  | { readonly ok: false; readonly error: string };

/** Valida no servidor — o `accept` do input não é garantia de nada. */
export function validateProfileImage(file: File): string | null {
  if (file.size === 0) return 'Selecione uma imagem.';

  if (file.size > MAX_PROFILE_IMAGE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `Imagem muito grande. O limite é 8 MB (a sua tem ${mb} MB).`;
  }

  /*
   * O tipo vazio passa.
   *
   * Galeria de iPhone e alguns navegadores Android mandam HEIC com
   * `type: ''`. Recusar aqui seria barrar exatamente o aparelho mais comum —
   * e não é esta checagem que protege: o `sharp` logo abaixo abre o arquivo e
   * falha se não for imagem de verdade, o que vale para qualquer coisa
   * renomeada para `.jpg`.
   */
  if (
    file.type.length > 0 &&
    !(ACCEPTED_PROFILE_IMAGE_TYPES as readonly string[]).includes(file.type)
  ) {
    return `Formato não aceito. Envie ${PROFILE_IMAGE_LABEL}.`;
  }

  return null;
}

/**
 * Reprocessa para WEBP no tamanho da peça.
 *
 * `cover` recorta em vez de distorcer: a foto vertical do celular virando
 * banner esticado é feia de um jeito que o aluno culpa o site, não o
 * enquadramento.
 */
async function toWebp(file: File, kind: ProfileImageKind): Promise<Buffer | null> {
  const { width, height } = PROFILE_IMAGE_SIZES[kind];

  try {
    // Import dinâmico: o `sharp` é um binário nativo e pesado, e nenhuma tela
    // que não envie imagem precisa pagar o carregamento dele.
    const { default: sharp } = await import('sharp');
    const bytes = Buffer.from(await file.arrayBuffer());

    return await sharp(bytes, { failOn: 'error' })
      .rotate() // respeita o EXIF antes de descartá-lo, senão a foto vira de lado
      .resize({ width, height, fit: 'cover', position: 'centre' })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (error) {
    console.error('[profileMedia] falha ao processar', error);
    return null;
  }
}

export async function uploadProfileImage(
  studentId: string,
  kind: ProfileImageKind,
  file: File,
): Promise<ProfileImageResult> {
  if (!isBlobConfigured()) {
    return {
      ok: false,
      error: 'O envio de imagens não está configurado. Avise a academia.',
    };
  }

  const problem = validateProfileImage(file);
  if (problem) return { ok: false, error: problem };

  const processed = await toWebp(file, kind);
  if (!processed) {
    return {
      ok: false,
      error: 'Não conseguimos ler esta imagem. Tente outra foto, ou tire uma nova.',
    };
  }

  try {
    const blob = await put(`perfis/${studentId}/${kind}.webp`, processed, {
      access: 'private',
      // Sem sufixo, trocar a foto colidiria com a anterior e o SDK lançaria
      // erro em vez de substituir.
      addRandomSuffix: true,
      contentType: 'image/webp',
    });

    return { ok: true, blobKey: blob.pathname };
  } catch (error) {
    console.error('[profileMedia] falha no upload', error);
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Falha ao enviar a imagem: ${message.slice(0, 140)}` };
  }
}

export interface OpenedImage {
  readonly stream: ReadableStream;
  readonly contentType: string;
}

/** **Uso exclusivo do servidor** — o conteúdo nunca vira URL para o navegador. */
export async function openProfileImage(blobKey: string): Promise<OpenedImage | null> {
  if (!isBlobConfigured() || blobKey.length === 0) return null;

  try {
    const result = await get(blobKey, { access: 'private' });
    if (!result || !('stream' in result) || !result.stream) return null;

    return {
      stream: result.stream,
      contentType: result.headers?.get('content-type') ?? 'image/webp',
    };
  } catch (error) {
    console.error('[profileMedia] falha ao abrir', error);
    return null;
  }
}

export async function deleteProfileImage(blobKey: string | null): Promise<void> {
  if (!isBlobConfigured() || !blobKey || blobKey.length === 0) return;

  try {
    await del(blobKey);
  } catch (error) {
    // Blob órfão é desperdício de bytes, não um erro para o aluno: a chave já
    // saiu do perfil e a rota não a serve mais.
    console.error('[profileMedia] falha ao remover', error);
  }
}
