import { NextResponse } from 'next/server';

import { resolveActiveProfile } from '@/lib/activeProfile';
import { getSessionUser } from '@/lib/auth';
import { getProfile, isProfileVisible } from '@/lib/repositories/profiles';
import { openProfileImage } from '@/lib/repositories/profileMedia';
import { getStudent } from '@/lib/repositories/students';
import { isStaff } from '@/lib/roles';

/**
 * Foto e banner do perfil.
 *
 * A imagem é gravada no Blob privado e não tem URL pública — nem uma difícil
 * de adivinhar. Esta rota confere, **a cada requisição**, três coisas: quem
 * pede tem sessão; o perfil pedido está visível; e, se não estiver, quem pede
 * é o dono dele ou é da academia.
 *
 * É o que faz "deixei meu perfil privado" ter efeito imediato. Com URL pública
 * do Blob, o endereço copiado continuaria funcionando para sempre — depois de
 * privar, depois de a gestão ocultar, depois de a ficha ser apagada. Boa parte
 * destas fotos é de criança.
 *
 * Qualquer recusa responde 404, nunca 403: um 403 confirmaria que aquele aluno
 * existe e tem perfil, o que já é informação sobre ele.
 */

export const dynamic = 'force-dynamic';

const naoEncontrado = (): NextResponse =>
  new NextResponse('Não encontrado', { status: 404 });

export async function GET(
  _request: Request,
  context: { params: Promise<{ studentId: string; kind: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return naoEncontrado();

  const { studentId, kind } = await context.params;
  if (kind !== 'avatar' && kind !== 'banner') return naoEncontrado();

  const [student, profile] = await Promise.all([getStudent(studentId), getProfile(studentId)]);
  if (!student || !profile) return naoEncontrado();

  const blobKey = kind === 'avatar' ? profile.avatarKey : profile.bannerKey;
  if (!blobKey) return naoEncontrado();

  /*
   * Quem pode ver uma imagem que não está pública.
   *
   * O dono, para a tela de edição mostrar a foto que ele acabou de enviar; o
   * responsável, pelo perfil ativo, que é como o pai edita o perfil do filho
   * de seis anos; e a academia, que precisa ver o que vai liberar ou ocultar —
   * moderar sem ver a imagem é assinar embaixo.
   */
  if (!isProfileVisible(profile, student, new Date())) {
    const perfilAtivo = await resolveActiveProfile(user.id, await getStudent(user.id));
    const administra = perfilAtivo?.profiles.some((item) => item.id === studentId) === true;

    if (!administra && !isStaff(user.role)) return naoEncontrado();
  }

  const image = await openProfileImage(blobKey);
  if (!image) return naoEncontrado();

  return new NextResponse(image.stream, {
    status: 200,
    headers: {
      'Content-Type': image.contentType,
      /*
       * `private` e curto.
       *
       * Sem cache nenhum, a lista da comunidade rebuscaria dezenas de imagens
       * a cada navegação. Cache compartilhado seria pior que URL pública: o
       * CDN entregaria a foto a quem a rota acabou de recusar. Cinco minutos no
       * navegador de quem já tinha permissão é o meio aceitável.
       */
      'Cache-Control': 'private, max-age=300, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self' blob: data:",
    },
  });
}
