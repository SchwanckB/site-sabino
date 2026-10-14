import type { Metadata } from 'next';
import Link from 'next/link';

import { runHealthChecks, type CheckState } from '@/lib/health';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Diagnóstico',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const STATE_STYLE: Readonly<Record<CheckState, string>> = {
  ok: 'border-emerald-500/40 bg-emerald-500/[.06]',
  erro: 'border-crimson/50 bg-crimson/[.07]',
  nao_configurado: 'border-amber-500/40 bg-amber-500/[.06]',
};

const STATE_LABEL: Readonly<Record<CheckState, string>> = {
  ok: 'Funcionando',
  erro: 'Com erro',
  nao_configurado: 'Não configurado',
};

/**
 * Diagnóstico dos serviços.
 *
 * Diferente de só listar variáveis faltando, aqui o Redis é realmente chamado
 * — grava, lê e apaga uma chave. Um token errado ou um banco pausado aparece
 * como erro concreto, com a mensagem do servidor, em vez de virar um genérico
 * "erro no banco" na cara do aluno.
 */
export default async function ConfigurarPage() {
  const checks = await runHealthChecks();
  const comProblema = checks.filter((check) => check.state !== 'ok');
  const bloqueado = checks.some(
    (check) =>
      check.state !== 'ok' && check.service !== 'Vercel Blob (documentos)',
  );

  return (
    <main id="conteudo" className="mx-auto w-full max-w-2xl px-5 py-16">
      <p className="eyebrow">Diagnóstico</p>
      <h1 className="mt-3 text-3xl leading-none sm:text-4xl">
        {bloqueado ? 'Falta configurar o acesso' : 'Serviços no ar'}
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
        {bloqueado
          ? 'A área de alunos precisa dos serviços abaixo. A landing page continua funcionando normalmente sem eles.'
          : 'Login e banco de dados respondendo. Se você chegou aqui por um erro, tente entrar novamente.'}
      </p>

      <ul className="mt-10 space-y-4">
        {checks.map((check) => (
          <li
            key={check.service}
            className={cn('rounded-2xl border p-5 backdrop-blur-md', STATE_STYLE[check.state])}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base normal-case tracking-normal text-foreground">
                {check.service}
              </h2>
              <span className="rounded-full border border-current/30 px-2.5 py-1 text-[11px] font-semibold">
                {STATE_LABEL[check.state]}
                {check.latencyMs !== null ? ` · ${check.latencyMs}ms` : ''}
              </span>
            </div>

            <p className="mt-3 break-words text-sm leading-relaxed text-muted">{check.detail}</p>
          </li>
        ))}
      </ul>

      {comProblema.length > 0 ? (
        <div className="surface-card mt-8 p-5 text-sm leading-relaxed text-muted">
          <p className="font-medium text-foreground">Onde colocar as variáveis</p>
          <p className="mt-2">
            Local: no arquivo <span className="font-mono text-xs">.env.local</span> na raiz do
            projeto. Produção: na Vercel, em{' '}
            <span className="text-foreground">Settings → Environment Variables</span>, marcando
            os três ambientes. Depois de salvar, faça um{' '}
            <span className="text-foreground">Redeploy</span> — variável de ambiente só vale a
            partir do próximo build.
          </p>
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className="btn-secondary">
          Voltar para o site
        </Link>
        {!bloqueado ? (
          <Link href="/entrar" className="btn-primary">
            Ir para o login
          </Link>
        ) : null}
      </div>
    </main>
  );
}
