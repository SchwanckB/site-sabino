import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { UpstashMock } from './upstashMock';

/**
 * Diagnóstico dos serviços.
 *
 * O objetivo é que "erro no banco" nunca mais chegue ao usuário sem resposta:
 * a tela de configuração precisa distinguir "não configurado" de "configurado
 * mas falhando", e mostrar a mensagem real do servidor.
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
    expect(result.detail.length).toBeGreaterThan(0);
    // A mensagem bruta é o que permite agir - não pode vir vazia.
    expect(result.detail).not.toBe('');
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

describe('checkClerk e checkBlob', () => {
  it('reporta Clerk conforme as chaves', async () => {
    delete process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'];
    delete process.env['CLERK_SECRET_KEY'];

    const semChaves = await import('@/lib/health');
    expect(semChaves.checkClerk().state).toBe('nao_configurado');

    vi.resetModules();
    process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] = 'pk_test_x';
    process.env['CLERK_SECRET_KEY'] = 'sk_test_x';

    const comChaves = await import('@/lib/health');
    expect(comChaves.checkClerk().state).toBe('ok');
  });

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
