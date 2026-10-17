'use client';

import { useState } from 'react';

import { cn, pluralize } from '@/lib/utils';

export interface RankingEntry {
  readonly position: number;
  readonly name: string;
  readonly belt: string;
  readonly score: number;
  readonly isMe: boolean;
}

type Recorte = 'mes' | 'geral';

/** Altura relativa de cada degrau. O 1º no meio, como num pódio de verdade. */
const PODIO: readonly { posicao: number; altura: string; medalha: string }[] = [
  { posicao: 2, altura: 'h-16', medalha: '🥈' },
  { posicao: 1, altura: 'h-24', medalha: '🥇' },
  { posicao: 3, altura: 'h-12', medalha: '🥉' },
];

export function RankingBoard({
  month,
  overall,
  myMonth,
  myOverall,
}: {
  readonly month: readonly RankingEntry[];
  readonly overall: readonly RankingEntry[];
  readonly myMonth: { position: number; score: number } | null;
  readonly myOverall: { position: number; score: number } | null;
}) {
  const [recorte, setRecorte] = useState<Recorte>('mes');

  const lista = recorte === 'mes' ? month : overall;
  const minha = recorte === 'mes' ? myMonth : myOverall;

  const podio = PODIO.map((degrau) => ({
    ...degrau,
    entrada: lista.find((item) => item.position === degrau.posicao),
  }));

  const restante = lista.filter((item) => item.position > 3);
  const estouNoTop = lista.some((item) => item.isMe);

  return (
    <div className="mt-8">
      <div role="group" aria-label="Recorte do ranking" className="flex gap-2">
        {([
          { id: 'mes', label: 'Este mês' },
          { id: 'geral', label: 'Desde sempre' },
        ] as const).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setRecorte(item.id)}
            aria-pressed={recorte === item.id}
            className={cn(
              'inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border px-4 text-sm font-medium transition-colors sm:flex-none',
              recorte === item.id
                ? 'border-crimson bg-crimson text-foreground'
                : 'border-hairline bg-white/[.04] text-muted hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <div className="surface-card mt-6 px-6 py-14 text-center">
          <p className="font-display text-lg uppercase tracking-tight">Ranking ainda vazio</p>
          <p className="mt-2 text-sm text-muted">
            Assim que as presenças começarem a entrar, o pódio aparece aqui.
          </p>
        </div>
      ) : (
        <>
          {/* Pódio ---------------------------------------------------------- */}
          <section aria-label="Pódio" className="surface-card mt-6 p-5 sm:p-6">
            <ol className="flex items-end justify-center gap-2 sm:gap-4">
              {podio.map((degrau) => (
                <li
                  key={degrau.posicao}
                  className="flex min-w-0 flex-1 flex-col items-center sm:max-w-[9rem]"
                >
                  {degrau.entrada ? (
                    <>
                      <span aria-hidden="true" className="text-2xl leading-none sm:text-3xl">
                        {degrau.medalha}
                      </span>
                      <p
                        className={cn(
                          'mt-2 w-full truncate text-center text-sm font-medium',
                          degrau.entrada.isMe ? 'text-crimson' : 'text-foreground',
                        )}
                        title={degrau.entrada.name}
                      >
                        {degrau.entrada.isMe ? 'Você' : degrau.entrada.name}
                      </p>
                      <p className="text-[11px] capitalize text-muted">{degrau.entrada.belt}</p>
                      <div
                        className={cn(
                          'mt-2 flex w-full items-start justify-center rounded-t-xl border border-b-0 pt-2',
                          degrau.altura,
                          degrau.entrada.isMe
                            ? 'border-crimson/50 bg-crimson/[.14]'
                            : 'border-hairline bg-white/[.06]',
                        )}
                      >
                        <span className="font-display text-lg leading-none tabular-nums">
                          {degrau.entrada.score}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div
                      className={cn(
                        'mt-10 w-full rounded-t-xl border border-b-0 border-dashed border-hairline',
                        degrau.altura,
                      )}
                    />
                  )}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-center text-xs text-muted">
              {recorte === 'mes' ? 'Treinos neste mês' : 'Treinos desde a matrícula'}
            </p>
          </section>

          {/* Do 4º em diante ------------------------------------------------ */}
          {restante.length > 0 ? (
            <ul className="mt-4 divide-y divide-hairline rounded-2xl border border-hairline bg-white/[.03]">
              {restante.map((item) => (
                <li
                  key={item.position}
                  className={cn(
                    'flex min-h-[52px] items-center gap-3 px-4',
                    item.isMe && 'bg-crimson/[.08]',
                  )}
                >
                  <span className="w-6 shrink-0 font-display text-sm tabular-nums text-muted">
                    {item.position}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-sm',
                        item.isMe ? 'font-semibold text-crimson' : 'text-foreground',
                      )}
                    >
                      {item.isMe ? 'Você' : item.name}
                    </span>
                    <span className="block text-[11px] capitalize text-muted">{item.belt}</span>
                  </span>
                  <span className="shrink-0 font-display text-sm tabular-nums">{item.score}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {/* Posição de quem ficou fora do top ------------------------------ */}
          {!estouNoTop ? (
            <div className="surface-card mt-4 p-5">
              {minha ? (
                <>
                  <p className="text-xs text-muted">Sua posição</p>
                  <p className="mt-1 font-display text-3xl leading-none tabular-nums text-crimson">
                    {minha.position}º
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {minha.score} {pluralize(minha.score, 'treino', 'treinos')}
                    {recorte === 'mes' ? ' neste mês' : ' no total'}.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-foreground">
                    Você ainda não pontuou {recorte === 'mes' ? 'neste mês' : 'no ranking'}.
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Faça o check-in na recepção e seu nome entra na lista.
                  </p>
                </>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
