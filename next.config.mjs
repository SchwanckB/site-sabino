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
 * Os domínios do Clerk entram por curinga, mais o host próprio derivado da
 * chave publicável — ver `clerkFrontendApiHost()` abaixo. Sem o conjunto
 * completo o navegador bloqueia o `clerk.browser.js` e o login não carrega.
 */
/**
 * O sufixo `:*` é obrigatório, não enfeite.
 *
 * Sem porta explícita, a CSP só aceita a porta padrão do esquema (443). O bot
 * protection do Clerk sonda `*.client.protect.clerk.com` nas portas 8443,
 * 18443, 2082 e 992 durante a confirmação do código de cadastro — bloqueadas,
 * a verificação estourava e a tela virava "client-side exception".
 */
/**
 * Domínio próprio da instância de produção, lido da chave publicável.
 *
 * Os curingas abaixo **não** cobrem produção com domínio próprio, e o
 * comentário anterior afirmava que sim. Uma instância de produção serve o
 * `clerk.browser.js` de `clerk.<seu-dominio>`, que não casa com `*.clerk.com`:
 * o navegador bloqueava o script pela CSP, o Clerk falhava com
 * `failed_to_load_clerk_js` e **nenhum formulário de login ou cadastro
 * montava** — a página subia com o texto próprio e um buraco no lugar dos
 * campos.
 *
 * A chave publicável carrega o host da Frontend API em base64 (o sufixo é
 * `$`), então derivar daqui cobre os dois ambientes sozinho e continua certo
 * se a academia trocar de domínio. Mesma decodificação de
 * `clerkInstanceHost()` em `lib/health.ts`.
 */
function clerkFrontendApiHost() {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  const encoded = key.replace(/^pk_(test|live)_/, '');
  if (encoded.length === 0) return null;

  try {
    const host = Buffer.from(encoded, 'base64').toString('utf8').replace(/\$+$/, '');
    // Só aceita algo com cara de domínio: lixo na variável não pode virar
    // entrada de CSP.
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? host : null;
  } catch {
    return null;
  }
}

const ownHost = clerkFrontendApiHost();

const CLERK_HOSTS = [
  'https://*.clerk.accounts.dev',
  'https://*.clerk.accounts.dev:*',
  'https://*.clerk.com',
  'https://*.clerk.com:*',
  'https://*.clerk.services',
  'https://*.clerk.services:*',
  // Domínio próprio da produção. Os curingas acima não o alcançam.
  ...(ownHost ? [`https://${ownHost}`, `https://${ownHost}:*`] : []),
];

/**
 * O bot protection do Clerk é o Cloudflare Turnstile, servido de um domínio
 * que não é do Clerk. Sem liberar este host, o cadastro parava em
 * `/cadastro/protect-check` com "Verification didn't complete" — a conta
 * ficava pela metade (o e-mail já aparecia como cadastrado) e nenhum aluno
 * conseguia concluir a matrícula.
 */
const TURNSTILE_HOST = 'https://challenges.cloudflare.com';

/**
 * Google Tag Manager e o que ele carrega.
 *
 * `googletagmanager.com` serve o `gtm.js` e, depois, o `gtag/js` do GA4. Os
 * domínios de `google-analytics` recebem os eventos; `doubleclick` e
 * `google.com` entram pelos pixels de conversão que o próprio GA dispara.
 *
 * **Esta lista cobre o GA4, e só ele.** O contêiner é um lugar onde se
 * adicionam tags sem tocar no código, e cada tag nova pode chamar um domínio
 * que não está aqui — o navegador bloqueia, a tag não dispara e nada avisa.
 * Foi assim que o `clerk.browser.js` caiu em produção (ver `test/csp.test.ts`).
 * Ao ligar uma tag nova, conferir o console por "Refused to load".
 */
const GOOGLE_TAG_SCRIPT = ['https://www.googletagmanager.com'];

const GOOGLE_TAG_CONNECT = [
  'https://www.googletagmanager.com',
  'https://*.googletagmanager.com',
  'https://www.google-analytics.com',
  'https://*.google-analytics.com',
  'https://*.analytics.google.com',
];

const GOOGLE_TAG_IMG = [
  'https://www.googletagmanager.com',
  'https://www.google-analytics.com',
  'https://*.google-analytics.com',
  'https://www.google.com',
  'https://*.g.doubleclick.net',
];

/**
 * O Fast Refresh do Next avalia código em tempo de execução, o que exige
 * 'unsafe-eval'. Liberar isso só em desenvolvimento mantém a produção estrita
 * — e evita que a própria CSP quebre o `npm run dev`, como quebrava.
 */
const isDev = process.env.NODE_ENV !== 'production';
const SCRIPT_EVAL = isDev ? " 'unsafe-eval'" : '';

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${SCRIPT_EVAL} ${CLERK_HOSTS.join(' ')} ${TURNSTILE_HOST} ${GOOGLE_TAG_SCRIPT.join(' ')}`,
  "style-src 'self' 'unsafe-inline'",
  // img.clerk.com serve os avatares das contas.
  `img-src 'self' data: blob: https://img.clerk.com https://*.clerk.com ${GOOGLE_TAG_IMG.join(' ')}`,
  "font-src 'self' data:",
  `connect-src 'self' ${CLERK_HOSTS.join(' ')} ${TURNSTILE_HOST} https://clerk-telemetry.com ${GOOGLE_TAG_CONNECT.join(' ')}`,
  /*
   * Mapa do Google na seção "Onde estamos" + fluxos em iframe do Clerk.
   * O Turnstile roda dentro de um iframe próprio.
   *
   * `'self'` é o documento do aluno na tela de aprovação, exibido num iframe
   * que aponta para a rota autenticada `/api/admin/documento/[userId]`. Sem
   * ele a diretiva caía no `default-src`, que não lista `'self'` para frames:
   * o navegador bloqueava o iframe e o professor **não conseguia ver a foto
   * antes de aprovar** — justamente quando ela importa. Depois de aprovado a
   * ficha abre o arquivo num link em nova aba, que é navegação e não frame, e
   * por isso funcionava; a diferença parecia uma regra de permissão, e era a
   * CSP.
   */
  `frame-src 'self' https://www.google.com ${CLERK_HOSTS.join(' ')} ${TURNSTILE_HOST}`,
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
  experimental: {
    // O padrão do Next é 1 MB, e uma foto de documento tirada no celular passa
    // disso com folga — o envio falhava com erro de servidor antes mesmo de a
    // validação rodar. Acompanha o MAX_DOCUMENT_BYTES (5 MB) com margem.
    serverActions: { bodySizeLimit: '6mb' },
  },
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
