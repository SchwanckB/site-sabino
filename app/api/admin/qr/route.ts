import { NextResponse } from 'next/server';
import QRCode from 'qrcode';

import { getSessionUser } from '@/lib/auth';
import { getCurrentQrToken } from '@/lib/repositories/qr';
import { siteUrl } from '@/lib/site';

/**
 * Imagem do QR de presença de uma turma.
 *
 * Cada turma tem o seu código, e ele é fixo: a ideia é imprimir e colar na
 * parede. O QR não carrega apenas o token — codifica a **URL da página de
 * check-in já com o token**, para a câmera nativa do celular resolver tudo.
 * Sem app, sem leitor dedicado, e a mãe que leva o filho registra a presença
 * do próprio aparelho.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'ADMIN') {
    return new NextResponse('Não encontrado', { status: 404 });
  }

  const classId = (new URL(request.url).searchParams.get('classId') ?? '').trim();
  if (classId.length === 0) {
    return NextResponse.json(
      { error: 'Escolha a turma antes de gerar o QR.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const current = getCurrentQrToken(classId);
  if (!current) {
    return NextResponse.json(
      { error: 'Falta configurar QR_TOKEN_SECRET para gerar os códigos.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const checkinUrl = `${siteUrl()}/painel/checkin?t=${encodeURIComponent(current.token)}`;

  const dataUrl = await QRCode.toDataURL(checkinUrl, {
    // Correção alta: o cartaz vai para a parede da academia e vai apanhar.
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 900,
    color: { dark: '#0E0E10', light: '#FFFFFF' },
  });

  return NextResponse.json(
    { dataUrl, classId: current.classId },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
