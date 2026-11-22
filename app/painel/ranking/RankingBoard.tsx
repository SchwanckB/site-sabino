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

/** Uma lista completa: o mês, o acumulado, e a posição do aluno em cada um. */
export interface RankingSlice {
  readonly month: readonly RankingEntry[];
  readonly overall: readonly RankingEntry[];
  readonly myMonth: { position: number; score: number } | null;
  readonly myOverall: { position: number; score: number } | null;
}

export interface RankingTab {
  readonly id: string;
  readonly label: string;
}

/** Altura relativa de cada degrau. O 1º no meio, como num pódio de verdade. */
const PODIO: readonly { posicao: number; altura: string; medalha: string }[] = [
  { posicao: 2, altura: 'h-16', medalha: '🥈' },
  { posicao: 1, altura: 'h-24', medalha: '🥇' },
  { posicao: 3, altura: 'h-12', medalha: '🥉' },
];

/**
 * O pódio, com duas dimensões de recorte.
 *
 * A modalidade escolhe **com quem** o aluno compete, e o período escolhe
 * **desde quando**. As duas vêm prontas do servidor, inteiras: trocar de aba
 * não vai ao banco, o que importa numa tela que a pessoa abre no celular para
 * conferir a própria posição e sai.
 */
export function RankingBoard({
  slices,
  tabs,
  mine,
  defaultTab,
}: {
  readonly slices: Readonly<Record<string, RankingSlice>>;
  readonly tabs: readonly RankingTab[];
  /**
   * As modalidades das turmas da ficha dele.
   *
   * São as abas que aparecem. Vazio — aluno recém-aprovado ainda sem turma —
   * cai em todas, que é melhor que uma tela sem aba nenhuma.
   */
  readonly mine: readonly string[];
  /** A principal delas: é nela que a tela abre. Ver `page.tsx`. */
  readonly defaultTab: string;
}) {
  const [recorte, setRecorte] = useState<Recorte>('mes');
  const [aba, setAba] = useState<string>(defaultTab);
  const [verTodas, setVerTodas] = useState(false);

  /*
   * As abas visíveis: as dele, ou todas quando ele pediu.
   *
   * Quem treina uma modalidade só não precisa de quatro abas — três delas são
   * listas em que ele não pontua, e a dele fica perdida no meio. O botão
   * devolve as outras a um toque.
   */
  const minhas = new Set(mine);
  const visiveis =
    verTodas || minhas.size === 0 ? tabs : tabs.filter((item) => minhas.has(item.id));

  /*
   * Fechar a lista com uma aba de fora selecionada volta para a principal.
   *
   * Sem isto, espiar o MMA e fechar deixaria a tela num recorte invisível: as
   * abas mostrariam só o Jiu-Jitsu e o pódio seria o do MMA, sem nada
   * explicando a diferença.
   */
  const abaValida = visiveis.some((item) => item.id === aba) ? aba : (visiveis[0]?.id ?? aba);
  if (abaValida !== aba) setAba(abaValida);

  const slice = slices[abaValida] ?? slices['geral'];
  const month = slice?.month ?? [];
  const overall = slice?.overall ?? [];

  const lista = recorte === 'mes' ? month : overall;
  const minha = (recorte === 'mes' ? slice?.myMonth : slice?.myOverall) ?? null;

  const abaAtual = tabs.find((item) => item.id === abaValida) ?? null;

  const podio = PODIO.map((degrau) => ({
    ...degrau,
    entrada: lista.find((item) => item.position === degrau.posicao),
  }));

  const restante = lista.filter((item) => item.position > 3);
  const estouNoTop = lista.some((item) => item.isMe);

  return (
    <div className="mt-8">
      {/*
        As modalidades.

        Rolam de lado no celular em vez de quebrarem em duas linhas: são quatro
        abas curtas, e uma segunda linha empurraria o pódio para baixo da
        dobra justamente na tela em que a pessoa quer ver o pódio.
      */}
      {visiveis.length > 1 || minhas.size > 0 ? (
        <div
          role="group"
          aria-label="Modalidade do ranking"
          className="-mx-4 mb-3 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
        >
          {visiveis.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setAba(item.id)}
              aria-pressed={abaValida === item.id}
              className={cn(
                'inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-full border px-4 text-sm font-medium transition-colors',
                abaValida === item.id
                  ? 'border-accent/60 bg-accent/15 text-foreground'
                  : 'border-hairline bg-white/[.04] text-muted hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}

          {/*
            O botão de espiar o resto.

            Discreto e à direita das abas, porque é a exceção: a tela existe
            para o aluno ver a disputa dele, e as outras modalidades são
            curiosidade. Some quando ele não tem turma na ficha — ali já
            aparecem todas.
          */}
          {minhas.size > 0 && minhas.size < tabs.length ? (
            <button
              type="button"
              onClick={() => setVerTodas((aberto) => !aberto)}
              aria-expanded={verTodas}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
            >
              {verTodas ? 'Só as minhas' : 'Ver todas'}
            </button>
          ) : null}
        </div>
      ) : null}

      <div role="group" aria-label="Período do ranking" className="flex gap-2">
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
        <div className="panel mt-6 px-6 py-14 text-center">
          <p className="font-display text-lg uppercase tracking-tight">Ranking ainda vazio</p>
          <p className="mt-2 text-sm text-muted">
            {abaAtual && abaValida !== 'geral'
              ? `Ninguém pontuou em ${abaAtual.label} ${recorte === 'mes' ? 'neste mês' : 'ainda'}.`
              : 'Assim que as presenças começarem a entrar, o pódio aparece aqui.'}
          </p>
        </div>
      ) : (
        <>
          {/* Pódio ---------------------------------------------------------- */}
          <section aria-label="Pódio" className="panel mt-6 p-5 sm:p-6">
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
                          degrau.entrada.isMe ? 'text-accent' : 'text-foreground',
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
                        item.isMe ? 'font-semibold text-accent' : 'text-foreground',
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
            <div className="panel mt-4 p-5">
              {minha ? (
                <>
                  <p className="text-xs text-muted">Sua posição</p>
                  <p className="mt-1 font-display text-3xl leading-none tabular-nums text-accent">
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
