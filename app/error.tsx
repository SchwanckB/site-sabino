'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Limite de erro das rotas públicas.
 *
 * Sem ele, uma exceção no cliente mostra só "Application error: a client-side
 * exception has occurred" — sem pista nenhuma para quem está do outro lado.
 * Aqui o erro vai para o console (e para os logs do navegador) e a pessoa vê
 * um caminho de saída.
 */
export default function AppError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error('[app] erro na renderização', error);
  }, [error]);

  return (
    <main id="conteudo" className="flex min-h-dvh items-center justify-center px-5 py-16">
      <div className="w-full max-w-lg text-center">
        <p className="eyebrow">Ops</p>
        <h1 className="mt-3 text-3xl leading-none sm:text-4xl">Algo deu errado</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          A página não carregou como deveria. Tente de novo — se continuar, fale com a academia
          pelo WhatsApp.
        </p>

        {error.digest ? (
          <p className="mt-4 font-mono text-xs text-muted">código: {error.digest}</p>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button type="button" onClick={reset} className="btn-primary">
            Tentar novamente
          </button>
          <Link href="/" className="btn-secondary">
            Voltar ao início
          </Link>
        </div>
      </div>
    </main>
  );
}
