import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { UpstashMock } from './upstashMock';

/**
 * Diagnóstico dos serviços.
 *
 * O objetivo é que "algo deu errado" nunca mais chegue ao usuário sem
 * resposta: a tela precisa distinguir "não configurado" de "configurado mas
 * falhando", e mostrar a mensagem real do servidor.
 */

const mock = new UpstashMock();
let endpoint = { url: '', token: '' };

beforeAll(async () => {
  endpoint = await mock.start();
});

afterAll(async () => {
  await mock.stop();
});

beforeEach(() => {
  mock.reset();
  vi.resetModules();
  delete process.env['UPSTASH_REDIS_REST_URL'];
  delete process.env['UPSTASH_REDIS_REST_TOKEN'];
  delete process.env['KV_REST_API_URL'];
  delete process.env['KV_REST_API_TOKEN'];
});

describe('checkRedis', () => {
  it('reporta "não configurado" quando falta credencial', async () => {
    const { checkRedis } = await import('@/lib/health');
    const result = await checkRedis();

    expect(result.state).toBe('nao_configurado');
    expect(result.detail).toContain('UPSTASH_REDIS_REST_URL');
  });

  it('reporta "ok" quando grava e lê de verdade', async () => {
    process.env['UPSTASH_REDIS_REST_URL'] = endpoint.url;
    process.env['UPSTASH_REDIS_REST_TOKEN'] = endpoint.token;

    const { checkRedis } = await import('@/lib/health');
    const result = await checkRedis();

    expect(result.state).toBe('ok');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('aceita as variáveis KV_* da integração Upstash da Vercel', async () => {
    // Era o caso real: o banco existia, mas com outro nome de variável.
    process.env['KV_REST_API_URL'] = endpoint.url;
    process.env['KV_REST_API_TOKEN'] = endpoint.token;

    const { checkRedis } = await import('@/lib/health');
    expect((await checkRedis()).state).toBe('ok');
  });

  it('reporta "erro" com a mensagem real quando o endereço não responde', async () => {
    // Porta fechada: é o que acontece com URL errada ou banco pausado.
    process.env['UPSTASH_REDIS_REST_URL'] = 'http://127.0.0.1:1';
    process.env['UPSTASH_REDIS_REST_TOKEN'] = 'token-qualquer';

    const { checkRedis } = await import('@/lib/health');
    const result = await checkRedis();

    expect(result.state).toBe('erro');
    // A mensagem bruta é o que permite agir — não pode vir vazia.
    expect(result.detail.length).toBeGreaterThan(0);
  });

  it('não confunde KV_URL (protocolo TCP) com a API REST', async () => {
    process.env['KV_URL'] = 'redis://default:senha@host:6379';
    process.env['REDIS_URL'] = 'redis://default:senha@host:6379';

    const { checkRedis } = await import('@/lib/health');
    expect((await checkRedis()).state).toBe('nao_configurado');

    delete process.env['KV_URL'];
    delete process.env['REDIS_URL'];
  });
});

describe('checkClerk', () => {
  it('reporta "não configurado" sem as chaves', async () => {
    delete process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'];
    delete process.env['CLERK_SECRET_KEY'];

    const { checkClerk } = await import('@/lib/health');
    expect((await checkClerk()).state).toBe('nao_configurado');
  });

  it('acusa chaves de ambientes diferentes antes de chamar a API', async () => {
    // pk_test com sk_live nunca funciona. Detectar pelo formato dá uma
    // mensagem útil em vez de um 401 genérico.
    process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] = 'pk_test_abc';
    process.env['CLERK_SECRET_KEY'] = 'sk_live_abc';

    const { checkClerk } = await import('@/lib/health');
    const result = await checkClerk();

    expect(result.state).toBe('erro');
    expect(result.detail).toContain('mesma aplicação');
  });

  it('reporta erro quando a chave secreta é recusada', async () => {
    process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] = 'pk_test_abc';
    process.env['CLERK_SECRET_KEY'] = 'sk_test_invalida';

    const { checkClerk } = await import('@/lib/health');
    const result = await checkClerk();

    expect(result.state).toBe('erro');
    // É o caso em que o cadastro funciona mas o servidor falha depois.
    expect(result.detail).toContain('MESMA aplicação');
  });
});

describe('clerkInstanceHost', () => {
  it('extrai o host da instância da chave publicável', async () => {
    const { clerkInstanceHost } = await import('@/lib/health');

    const host = 'native-skunk-1448.clerk.accounts.dev';
    const chave = `pk_test_${Buffer.from(`${host}$`).toString('base64')}`;

    // É esse host que permite conferir, a olho, se as duas chaves saíram da
    // mesma aplicação do Clerk.
    expect(clerkInstanceHost(chave)).toBe(host);
  });

  it('devolve null para chave malformada', async () => {
    const { clerkInstanceHost } = await import('@/lib/health');

    expect(clerkInstanceHost('pk_test_')).toBeNull();
    expect(clerkInstanceHost('lixo')).toBeNull();
    expect(clerkInstanceHost('')).toBeNull();
  });
});

describe('checkBlob', () => {
  it('trata o Blob como opcional', async () => {
    delete process.env['BLOB_READ_WRITE_TOKEN'];

    const { checkBlob } = await import('@/lib/health');
    const result = checkBlob();

    expect(result.state).toBe('nao_configurado');
    expect(result.detail).toContain('Opcional');
  });
});

describe('runHealthChecks', () => {
  it('cobre os três serviços', async () => {
    process.env['UPSTASH_REDIS_REST_URL'] = endpoint.url;
    process.env['UPSTASH_REDIS_REST_TOKEN'] = endpoint.token;

    const { runHealthChecks } = await import('@/lib/health');
    const checks = await runHealthChecks();

    expect(checks.map((c) => c.service)).toEqual([
      'Clerk (login)',
      'Upstash Redis',
      'Vercel Blob (documentos)',
    ]);
  });
});
