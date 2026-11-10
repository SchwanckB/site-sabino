'use client';

import { useEffect, useState } from 'react';

/**
 * Qual âncora da navegação está sendo lida agora.
 *
 * A navegação tinha cinco atalhos e nenhum deles acendia: depois de rolar
 * três seções, nada na tela dizia onde se estava. O marcador resolve isso sem
 * custo de rolagem — um IntersectionObserver em vez de medir posição a cada
 * evento de scroll.
 *
 * A faixa de observação começa abaixo do cabeçalho fixo (88px) e termina a
 * 55% da altura da janela: assim a seção só é considerada "atual" quando
 * realmente ocupa a leitura, e não no instante em que a borda aparece.
 */
export function useActiveSection(hrefs: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const ids = hrefs
      .filter((href) => href.startsWith('#'))
      .map((href) => href.slice(1));

    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Entre duas seções visíveis, vale a que está mais acima na página:
        // é a que o leitor está terminando, não a que está começando.
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible[0]) setActive(`#${visible[0].target.id}`);
      },
      { rootMargin: '-88px 0px -45% 0px', threshold: 0 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [hrefs]);

  return active;
}
