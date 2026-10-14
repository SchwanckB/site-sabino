'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Limite de erro do painel do admin.
 *
 * Sem isto, uma falha no servidor mostra a tela preta padrão da Vercel com um
 * digest e nada mais — inútil para quem está na recepção. Aqui o erro continua
 * sendo registrado nos logs, mas a pessoa vê o que fazer.
 */
export default function AdminError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin] erro na renderização', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-5">
      <div className="w-full max-w-lg text-center">
        <p className="eyebrow">Painel do admin</p>
        <h1 className="mt-3 text-3xl leading-none">Algo falhou ao carregar</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          A tela não conseguiu buscar os dados. Normalmente é conexão com o banco — tente de
          novo em alguns segundos.
        </p>

        {error.digest ? (
          <p className="mt-4 font-mono text-xs text-muted">código: {error.digest}</p>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button type="button" onClick={reset} className="btn-primary">
            Tentar novamente
          </button>
          <Link href="/admin" className="btn-secondary">
            Voltar à visão geral
          </Link>
        </div>
      </div>
    </div>
  );
}
