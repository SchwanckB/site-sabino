/**
 * Content Security Policy.
 *
 * `script-src` precisa de `'unsafe-inline'`: a pagina e pre-renderizada
 * estaticamente e o Next injeta o payload RSC em scripts inline. A alternativa
 * (nonce por requisicao via middleware) forcaria renderizacao dinamica em toda
 * visita e derrubaria o alvo de Performance >= 90 do Lighthouse.
 *
 * `style-src` tambem precisa: Tailwind e, principalmente, o Framer Motion
 * escrevem em atributos `style` inline, que nonce nao cobre.
 *
 * Ao adicionar Clerk e Vercel Blob nas proximas rodadas, incluir os dominios
 * deles em `script-src`, `connect-src`, `img-src` e `frame-src`.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  // Mapa do Google embutido na secao "Onde estamos".
  'frame-src https://www.google.com',
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
    // Nada disso e usado na landing page. O check-in por QR Code (modulo do
    // aluno) vai precisar liberar `camera=(self)` na rota dele.
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
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
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
