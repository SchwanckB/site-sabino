/**
 * Etiquetas de cache compartilhadas entre quem lê e quem escreve.
 *
 * A landing page é estática. Para continuar estática lendo do Redis, cada
 * leitura é embrulhada em `unstable_cache` com uma destas etiquetas; o painel
 * do admin invalida a etiqueta ao salvar, e a página pública se refaz na
 * próxima visita.
 *
 * Sem isso, o `fetch` com `no-store` do cliente Upstash marca a rota como
 * dinâmica durante o build, o Next aborta a geração estática e a leitura cai
 * no seed — foi exatamente o que aconteceu: o site ignorava em silêncio tudo
 * que era editado no painel.
 */

export const CACHE_TAGS = {
  schedule: 'schedule',
  plans: 'plans',
} as const;

/** Janela de revalidação das leituras públicas, em segundos. */
export const PUBLIC_REVALIDATE_SECONDS = 3600;
