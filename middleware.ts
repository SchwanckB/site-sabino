import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Proteção das rotas logadas.
 *
 * O papel (ADMIN/ALUNO) **não** é verificado aqui: ler `publicMetadata` no
 * middleware exigiria um JWT template configurado no painel do Clerk, e
 * esquecer esse passo transformaria a checagem em um falso positivo silencioso.
 * A verificação de papel acontece nos layouts de `/admin` e `/painel`, com
 * `currentUser()`, que lê o metadado direto da fonte.
 *
 * Sem as chaves do Clerk o app não quebra: as rotas logadas redirecionam para
 * `/configurar`, e a landing page segue pública e funcionando.
 */

const isProtectedRoute = createRouteMatcher([
  '/painel(.*)',
  '/admin(.*)',
  '/onboarding(.*)',
  '/aguardando(.*)',
]);

/**
 * Rotas de API do painel: documento do aluno, planilhas, QR da recepção.
 *
 * Cada uma já confere sessão e permissão por dentro — esta camada é a segunda,
 * e existe porque a primeira depende de alguém lembrar de escrevê-la na rota
 * seguinte. Elas ficam fora de `isProtectedRoute` porque não devem redirecionar
 * para a tela de login: quem as chama é um `fetch` ou um `<a download>`, e um
 * HTML de login no lugar do PDF é pior que um 404.
 */
const isAdminApi = createRouteMatcher(['/api/admin(.*)']);

const clerkConfigured =
  typeof process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY === 'string' &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.length > 0 &&
  typeof process.env.CLERK_SECRET_KEY === 'string' &&
  process.env.CLERK_SECRET_KEY.length > 0;

const withClerk = clerkMiddleware(async (auth, request) => {
  if (isAdminApi(request)) {
    const { userId } = await auth();
    // 404 e não 401: a rota serve dado da academia, e negar sem confirmar que
    // ela existe é o que o Clerk já faz por padrão no resto do painel.
    if (!userId) {
      return new NextResponse('Não encontrado', { status: 404 });
    }
    return NextResponse.next();
  }

  if (isProtectedRoute(request)) {
    // Sem `unauthenticatedUrl` o Clerk responde 404 para não revelar que a
    // rota existe. Aqui a rota é pública por natureza (todo aluno sabe que há
    // um painel), e 404 em sessão expirada é um beco sem saída: o certo é
    // levar ao login e voltar para onde a pessoa queria ir.
    const entrar = new URL('/entrar', request.url);
    entrar.searchParams.set('redirect_url', request.url);

    await auth.protect({ unauthenticatedUrl: entrar.toString() });
  }
  return NextResponse.next();
});

function withoutClerk(request: NextRequest): NextResponse {
  if (isAdminApi(request)) {
    return new NextResponse('Não encontrado', { status: 404 });
  }
  if (isProtectedRoute(request)) {
    return NextResponse.redirect(new URL('/configurar', request.url));
  }
  return NextResponse.next();
}

export default clerkConfigured ? withClerk : withoutClerk;

export const config = {
  matcher: [
    // Tudo, menos arquivos estáticos e internos do Next.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    // Caminho do proxy automatico do Clerk.
    '/__clerk/:path*',
  ],
};
