'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '@/components/app/Icon';
import { cn } from '@/lib/utils';
import { normalizeSearch } from '@/utils/searchText';

export interface SearchEntry {
  readonly id: string;
  readonly name: string;
  /** Linha de apoio: faixa, academia, situação. */
  readonly detail: string;
  /** Texto já normalizado no servidor, para a busca não refazer isso a cada tecla. */
  readonly haystack: string;
}

/**
 * Busca única do painel.
 *
 * Acha o aluno por nome ou telefone e vai direto para a ficha. A alternativa
 * — abrir Alunos, filtrar, rolar — custa quatro toques no celular enquanto o
 * aluno espera na recepção.
 *
 * A lista inteira vem do servidor e a filtragem acontece aqui: com dezenas de
 * alunos isso é instantâneo e funciona sem round-trip a cada letra.
 */
export function QuickSearch({ entries }: { readonly entries: readonly SearchEntry[] }) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const limpo = normalizeSearch(term);
    if (limpo.length < 2) return [];

    return entries.filter((entry) => entry.haystack.includes(limpo)).slice(0, 8);
  }, [entries, term]);

  // Clique fora fecha. Sem isso a lista fica por cima do conteúdo no celular.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <label className="block">
        <span className="sr-only">Buscar aluno por nome ou telefone</span>
        <span className="relative block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <Icon name="alunos" className="h-4 w-4" />
          </span>
          <input
            type="search"
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false);
            }}
            placeholder="Buscar aluno por nome ou telefone…"
            className="min-h-[44px] w-full rounded-xl border border-hairline bg-white/[.04] pl-9 pr-3 text-sm text-foreground placeholder:text-muted/70 focus:border-crimson focus:outline-none"
          />
        </span>
      </label>

      {open && term.trim().length >= 2 ? (
        <div className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-2xl border border-hairline bg-ink shadow-2xl">
          {results.length === 0 ? (
            <p className="px-4 py-5 text-sm text-muted">Nenhum aluno com esse nome ou telefone.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-hairline">
              {results.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/admin/alunos/${entry.id}`}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex min-h-[52px] flex-col justify-center gap-0.5 px-4 py-2',
                      'transition-colors hover:bg-white/[.05]',
                    )}
                  >
                    <span className="truncate text-sm text-foreground">{entry.name}</span>
                    <span className="truncate text-xs text-muted">{entry.detail}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
