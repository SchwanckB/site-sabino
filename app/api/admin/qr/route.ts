import { NextResponse } from 'next/server';
import QRCode from 'qrcode';

import { getSessionUser } from '@/lib/auth';
import { getCurrentQrToken, rotateQrToken } from '@/lib/repositories/qr';
import { siteUrl } from '@/lib/site';

/**
 * Token + imagem do QR da recepção.
 *
 * Cada turma tem o seu QR: o token amarra a presença àquela aula, e não à
 * janela de horário — o que resolve a ambiguidade de dois horários colados e
 * impede que o código de uma academia sirva na outra.
 *
 * O QR não carrega apenas o token: ele codifica a **URL da página de check-in
 * já com o token**. Assim a câmera nativa do celular resolve tudo — não é
 * preciso app nem leitor dedicado, e a mãe que leva o filho consegue registrar
 * a presença do próprio aparelho.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'ADMIN') {
    return new NextResponse('Não encontrado', { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const classId = (params.get('classId') ?? '').trim();
  const force = params.get('rotate') === '1';

  if (classId.length === 0) {
    return NextResponse.json(
      { error: 'Escolha a turma antes de gerar o QR.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const current = force
    ? await rotateQrToken(classId)
    : await getCurrentQrToken(classId);

  if (!current) {
    return NextResponse.json(
      { error: 'Banco de dados não configurado.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const checkinUrl = `${siteUrl()}/painel/checkin?t=${encodeURIComponent(current.token)}`;

  const dataUrl = await QRCode.toDataURL(checkinUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 720,
    color: { dark: '#0E0E10', light: '#FFFFFF' },
  });

  return NextResponse.json(
    { dataUrl, expiresIn: current.expiresIn, classId: current.classId },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
