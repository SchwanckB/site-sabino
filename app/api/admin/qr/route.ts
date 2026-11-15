import { NextResponse } from 'next/server';
import QRCode from 'qrcode';

import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';
import { getCurrentQrToken } from '@/lib/repositories/qr';
import { isUnitId } from '@/types/domain';
import { siteUrl } from '@/lib/site';

/**
 * Imagem do QR de presença da academia.
 *
 * Um cartaz por unidade, fixo: a ideia é imprimir e colar na parede. Quem
 * escolhe a turma é o aluno, no painel dele, depois de escanear.
 *
 * O QR não carrega apenas o código — codifica a **URL da página de check-in
 * já com ele**, para a câmera nativa do celular resolver tudo. Sem app, sem
 * leitor dedicado, e a mãe que leva o filho registra a presença do próprio
 * aparelho.
 *
 * A mesma URL volta em texto na resposta, e é ela que se grava numa etiqueta
 * NFC. O código do cartaz é fixo, então a etiqueta tem exatamente o mesmo
 * alcance do papel na parede: aproximar o celular abre esta URL, e o resto do
 * caminho é o do QR.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'aula')) {
    return new NextResponse('Não encontrado', { status: 404 });
  }

  const unit = (new URL(request.url).searchParams.get('unit') ?? '').trim();
  if (!isUnitId(unit)) {
    return NextResponse.json(
      { error: 'Escolha a academia antes de gerar o QR.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const current = getCurrentQrToken(unit);

  const checkinUrl = `${siteUrl()}/painel/checkin?t=${encodeURIComponent(current.token)}`;

  /*
   * A URL da plaquinha NFC é outra, e mais curta.
   *
   * `/presenca/<codigo>` grava a presença na própria abertura da URL: o aluno
   * encosta o celular e lê a confirmação, sem abrir app nem tocar em botão. A
   * do QR não serve para isso — ela abre a tela de check-in, que é o certo
   * para a câmera (ali o aluno já está com o telefone na mão e olhando) e um
   * passo a mais para quem só encostou o aparelho na parede.
   */
  const nfcUrl = `${siteUrl()}/presenca/${encodeURIComponent(current.token)}`;

  const dataUrl = await QRCode.toDataURL(checkinUrl, {
    // Correção alta: o cartaz vai para a parede da academia e vai apanhar.
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 900,
    color: { dark: '#0E0E10', light: '#FFFFFF' },
  });

  return NextResponse.json(
    { dataUrl, unit: current.unit, checkinUrl, nfcUrl },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
