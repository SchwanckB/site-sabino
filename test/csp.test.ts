import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A CSP precisa liberar o domínio próprio da instância de produção.
 *
 * Existe por causa de uma falha real em produção: `CLERK_HOSTS` listava
 * `*.clerk.accounts.dev` e `*.clerk.com`, e um comentário afirmava que o
 * segundo cobria "produção com domínio próprio". Não cobre — uma instância de
 * produção serve o `clerk.browser.js` de `clerk.<dominio-da-academia>`, que não
 * casa com nenhum dos dois curingas.
 *
 * O resultado era silencioso no servidor e fatal no navegador: a página subia
 * com o texto próprio, a CSP bloqueava o script, o Clerk morria com
 * `failed_to_load_clerk_js` e **nenhum campo de login ou cadastro aparecia**.
 * Nenhum teste olhava para isso porque o `next.config.mjs` não era testado.
 */

/** Monta uma chave publicável como o Clerk emite: host em base64, sufixo `$`. */
function publishableKeyFor(host: string, env: 'test' | 'live'): string {
  return `pk_${env}_${Buffer.from(`${host}$`).toString('base64')}`;
}

async function directiveFor(publishableKey: string, directive: string): Promise<string> {
  process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] = publishableKey;

  // O config lê a variável no topo do módulo, então precisa ser reavaliado a
  // cada caso — sem isso todos os testes veriam a primeira chave carregada.
  vi.resetModules();
  // `next.config.mjs` é JavaScript sem declaração de tipos. Criar um `.d.ts` só
  // para este teste seria mais ruído do que a supressão pontual.
  // @ts-expect-error -- módulo JS sem tipos
  const mod = (await import('../next.config.mjs')) as {
    default: { headers: () => Promise<{ headers: { key: string; value: string }[] }[]> };
  };
  const headers = await mod.default.headers();
  const csp = headers[0]!.headers.find(
    (h: { key: string }) => h.key === 'Content-Security-Policy',
  )!.value;

  return csp.split('; ').find((part) => part.startsWith(directive)) ?? '';
}

const scriptSrcFor = (key: string): Promise<string> => directiveFor(key, 'script-src');

const original = process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'];

beforeEach(() => {
  process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] = original;
});

afterEach(() => {
  if (original === undefined) delete process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'];
  else process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] = original;
});

describe('CSP libera o host da Frontend API do Clerk', () => {
  it('inclui o domínio próprio de uma instância de produção', async () => {
    const script = await scriptSrcFor(
      publishableKeyFor('clerk.sabinoacademia.com.br', 'live'),
    );

    // Este é o caso que quebrou: sem esta entrada o navegador bloqueia o
    // clerk.browser.js e o formulário não monta.
    expect(script).toContain('https://clerk.sabinoacademia.com.br');
  });

  it('inclui a porta curinga do domínio próprio', async () => {
    const script = await scriptSrcFor(
      publishableKeyFor('clerk.sabinoacademia.com.br', 'live'),
    );

    // O bot protection sonda portas não padrão; sem `:*` a CSP só aceita 443.
    expect(script).toContain('https://clerk.sabinoacademia.com.br:*');
  });

  it('continua cobrindo instâncias de desenvolvimento', async () => {
    const script = await scriptSrcFor(
      publishableKeyFor('native-skunk-1448.clerk.accounts.dev', 'test'),
    );

    expect(script).toContain('https://*.clerk.accounts.dev');
    expect(script).toContain('https://native-skunk-1448.clerk.accounts.dev');
  });

  it('mantém o Turnstile, que serve de fora do Clerk', async () => {
    const script = await scriptSrcFor(publishableKeyFor('clerk.exemplo.com.br', 'live'));
    expect(script).toContain('https://challenges.cloudflare.com');
  });

  it('não quebra sem chave configurada', async () => {
    const script = await scriptSrcFor('');

    // A landing precisa continuar servindo mesmo sem Clerk configurado.
    expect(script).toContain("script-src 'self'");
    expect(script).toContain('https://*.clerk.accounts.dev');
  });

  it('libera o próprio domínio em frame-src, para o documento do aluno', async () => {
    const frame = await directiveFor(publishableKeyFor('clerk.exemplo.com.br', 'live'), 'frame-src');

    /*
     * Sem isto o iframe de /api/admin/documento era bloqueado e o professor
     * não conseguia ver a foto **antes** de aprovar o cadastro — que é o
     * único momento em que ela serve para decidir. Depois de aprovado a ficha
     * abre o arquivo em nova aba, que não é frame, e por isso funcionava.
     */
    expect(frame).toContain("'self'");
  });

  it('ignora valor que não tem cara de domínio', async () => {
    // Lixo na variável não pode virar entrada de CSP.
    const script = await scriptSrcFor('pk_live_' + Buffer.from('nao-e-dominio$').toString('base64'));
    expect(script).not.toContain('nao-e-dominio');
  });
});
