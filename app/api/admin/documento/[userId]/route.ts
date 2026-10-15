import { NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/auth';
import { openDocument } from '@/lib/repositories/documents';
import { getStudent } from '@/lib/repositories/students';

/**
 * Visualização do documento do aluno, só para ADMIN.
 *
 * O arquivo é gravado com acesso privado: não existe URL pública para ele, nem
 * uma impossível de adivinhar. Esta rota confere a sessão e transmite os bytes
 * com `no-store`. Sem sessão de administrador responde 404 — não confirma nem
 * que o aluno existe.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser();

  if (!user || user.role !== 'ADMIN') {
    return new NextResponse('Não encontrado', { status: 404 });
  }

  const { userId } = await context.params;
  const student = await getStudent(userId);

  if (!student?.docBlobKey) {
    return new NextResponse('Não encontrado', { status: 404 });
  }

  const document = await openDocument(student.docBlobKey);
  if (!document) {
    return new NextResponse('Não encontrado', { status: 404 });
  }

  return new NextResponse(document.stream, {
    status: 200,
    headers: {
      'Content-Type': document.contentType,
      'Content-Disposition': `inline; filename="documento-${userId}"`,
      'Cache-Control': 'no-store, private, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self' blob: data:; object-src 'self'",
    },
  });
}
