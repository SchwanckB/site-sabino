'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Limite de erro da área do aluno.
 *
 * Sem isto, uma falha no servidor mostra a tela preta padrão da Vercel com um
 * digest e nada mais. O erro segue indo para os logs; o aluno vê uma mensagem
 * que faz sentido e um botão para tentar de novo.
 */
export default function PainelError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error('[painel] erro na renderização', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-5">
      <div className="w-full max-w-lg text-center">
        <p className="eyebrow">Área do aluno</p>
        <h1 className="mt-3 text-3xl leading-none">Algo falhou ao carregar</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Não conseguimos carregar seus dados agora. Tente de novo em alguns segundos ou fale
          com a recepção.
        </p>

        {error.digest ? (
          <p className="mt-4 font-mono text-xs text-muted">código: {error.digest}</p>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button type="button" onClick={reset} className="btn-primary">
            Tentar novamente
          </button>
          <Link href="/painel" className="btn-secondary">
            Voltar ao meu painel
          </Link>
        </div>
      </div>
    </div>
  );
}
