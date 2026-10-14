import { NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/auth';
import { resolveDocumentUrl } from '@/lib/repositories/documents';
import { getStudent } from '@/lib/repositories/students';

/**
 * Visualização do documento do aluno, só para ADMIN.
 *
 * A URL do Vercel Blob nunca chega ao navegador: esta rota confere a sessão,
 * busca a URL interna e **transmite os bytes**. Mesmo que alguém descubra o ID
 * de um aluno, sem sessão de administrador recebe 404 — e a resposta carrega
 * `no-store` para não ficar em cache de proxy nem do navegador.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser();

  // 404 em vez de 403: não confirma a existência do aluno para quem não pode ver.
  if (!user || user.role !== 'ADMIN') {
    return new NextResponse('Não encontrado', { status: 404 });
  }

  const { userId } = await context.params;
  const student = await getStudent(userId);

  if (!student?.docBlobKey) {
    return new NextResponse('Não encontrado', { status: 404 });
  }

  const url = await resolveDocumentUrl(student.docBlobKey);
  if (!url) {
    return new NextResponse('Não encontrado', { status: 404 });
  }

  const upstream = await fetch(url, { cache: 'no-store' });
  if (!upstream.ok || !upstream.body) {
    return new NextResponse('Não encontrado', { status: 404 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename="documento-${userId}"`,
      'Cache-Control': 'no-store, private, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      // O documento é renderizado em um <iframe> do próprio painel.
      'Content-Security-Policy': "default-src 'none'; img-src 'self' blob: data:; object-src 'self'",
    },
  });
}
