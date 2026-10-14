/**
 * Content Security Policy.
 *
 * `script-src` precisa de `'unsafe-inline'`: a landing page é pré-renderizada
 * estaticamente e o Next injeta o payload RSC em scripts inline. A alternativa
 * (nonce por requisição via middleware) forçaria renderização dinâmica em toda
 * visita e derrubaria o alvo de Performance >= 90 do Lighthouse.
 *
 * `style-src` também precisa: Tailwind e, principalmente, o Framer Motion
 * escrevem em atributos `style` inline, que nonce não cobre.
 *
 * Os domínios do Clerk entram por curinga para cobrir os dois ambientes:
 * `*.clerk.accounts.dev` nas instâncias de desenvolvimento e `*.clerk.com` em
 * produção com domínio próprio. Sem isso o navegador bloqueia o `clerk.browser.js`
 * e o login simplesmente não carrega.
 */
const CLERK_HOSTS = [
  'https://*.clerk.accounts.dev',
  'https://*.clerk.com',
  'https://*.clerk.services',
];

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${CLERK_HOSTS.join(' ')}`,
  "style-src 'self' 'unsafe-inline'",
  // img.clerk.com serve os avatares das contas.
  "img-src 'self' data: blob: https://img.clerk.com https://*.clerk.com",
  "font-src 'self' data:",
  `connect-src 'self' ${CLERK_HOSTS.join(' ')} https://clerk-telemetry.com`,
  // Mapa do Google na seção "Onde estamos" + fluxos em iframe do Clerk.
  `frame-src https://www.google.com ${CLERK_HOSTS.join(' ')}`,
  // O Clerk inicializa workers a partir de blob:.
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  {
    key: 'Permissions-Policy',
    // A câmera fica liberada só para a própria origem: o check-in por QR do
    // aluno depende dela. Microfone, geolocalização e pagamento, nunca.
    value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      // Avatares do Clerk no UserButton.
      { protocol: 'https', hostname: 'img.clerk.com' },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
