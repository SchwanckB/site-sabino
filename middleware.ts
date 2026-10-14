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

const clerkConfigured =
  typeof process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY === 'string' &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.length > 0 &&
  typeof process.env.CLERK_SECRET_KEY === 'string' &&
  process.env.CLERK_SECRET_KEY.length > 0;

const withClerk = clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
  return NextResponse.next();
});

function withoutClerk(request: NextRequest): NextResponse {
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
