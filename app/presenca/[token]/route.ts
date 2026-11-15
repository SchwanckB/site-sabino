import { NextResponse } from 'next/server';

import { checkinAction, listCheckinOptions } from '@/app/painel/actions';

/**
 * Presença por aproximação — a plaquinha NFC da recepção.
 *
 * O aluno encosta o celular na plaquinha e pronto: o sistema operacional abre
 * esta URL, e a presença entra aqui, nesta requisição. Não há app para abrir,
 * tela para esperar nem botão para tocar — que é a diferença entre isto e o
 * QR, onde a câmera abre a página de check-in e ela resolve em seguida.
 *
 * **Rota `GET` que grava, de propósito.** É o único jeito: uma etiqueta NFC
 * passiva só sabe entregar uma URL, e exigir um toque depois do toque na
 * plaquinha desfaria a razão de ela existir. O que torna isso aceitável:
 *
 *   - a gravação é idempotente — a trava é um `SET NX` por aluno, dia e
 *     turma, então abrir a URL dez vezes dá uma presença;
 *   - só vale dentro da janela da aula, que é mecânica e estreita;
 *   - quem não tem sessão não grava nada: o middleware manda para o login
 *     antes de chegar aqui, e volta para cá depois;
 *   - nenhuma tela do site aponta para esta rota, então não há `prefetch` do
 *     Next para disparar a gravação sem o aluno querer. A prévia de link do
 *     WhatsApp também não grava: ela não tem sessão.
 *
 * O código da plaquinha é o mesmo do cartaz impresso — fixo, por unidade, e
 * nunca foi segredo (ver `lib/repositories/qr.ts`). A etiqueta tem exatamente
 * o mesmo alcance do papel na parede.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await context.params;

  const paraEscolher = new URL(
    `/painel/checkin?t=${encodeURIComponent(token)}`,
    request.url,
  );

  const opcoes = await listCheckinOptions(token);

  /*
   * Código inválido, sem sessão de aluno, matrícula inativa.
   *
   * A tela de check-in já diz cada um desses casos com a frase certa, e
   * duplicar as mensagens aqui seria manter duas cópias do mesmo texto.
   */
  if (!opcoes.ok) {
    return NextResponse.redirect(paraEscolher);
  }

  const minhas = opcoes.classes.filter((option) => option.mine);
  const unica = minhas[0];

  /*
   * O caso de toda noite: uma turma dele aberta, grava e confirma.
   *
   * Com duas — quem encadeia MMA e jiu —, a pergunta "vai ficar para a
   * seguinte?" tem de ser feita, e ela vive na tela de check-in. Com nenhuma,
   * a lista do que está acontecendo também. Nos dois a plaquinha leva para
   * lá, que é um toque a mais na exceção e nenhum no caso comum.
   */
  if (minhas.length === 1 && unica) {
    await checkinAction(token, [unica.classId]);
    return NextResponse.redirect(new URL('/presenca/pronto', request.url));
  }

  /*
   * Já marcou tudo o que é dele: a plaquinha encostada duas vezes, que é o
   * que acontece quando o aluno não tem certeza se funcionou. A confirmação
   * lê o banco e mostra a presença que já existe — é a resposta tranquila,
   * não um erro.
   */
  if (minhas.length === 0 && opcoes.alreadyDone !== null) {
    return NextResponse.redirect(new URL('/presenca/pronto', request.url));
  }

  return NextResponse.redirect(paraEscolher);
}
