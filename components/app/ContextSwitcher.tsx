'use client';

import Link from 'next/link';

import { Icon, type IconName } from '@/components/app/Icon';
import { cn, initials } from '@/lib/utils';

/**
 * De quem é esta tela, e para onde dá para ir.
 *
 * Uma conta pode ser três coisas ao mesmo tempo: aluno, responsável por outra
 * ficha, e professor. O Eloy é o caso que trouxe isto — treina nos adultos, o
 * filho é do infantil, a esposa também treina, e ele dá aula. Antes essas
 * trocas viviam em lugares diferentes: a ficha do filho num painel no meio da
 * página inicial do aluno, e o painel do professor num item de menu.
 *
 * Agora é um controle só, no cabeçalho de **todas** as telas logadas. As duas
 * trocas aparecem lado a lado e nenhuma substitui a outra — professor que é
 * pai continua tendo o caminho para o /admin, e pai que não dá aula nunca vê
 * esse item.
 *
 * `<details>` em vez de um menu com estado: é uma gaveta nativa, abre sem
 * JavaScript, fecha com Esc, e cada troca de ficha é um `<button type=submit>`
 * de um formulário de verdade. O seletor inteiro funciona com o script
 * desligado, que é o estado de boa parte dos celulares na porta da academia
 * com a rede ruim.
 */

export interface ProfileChoice {
  readonly id: string;
  readonly name: string;
  /** `Você`, `Infantil`, `Aguardando aprovação`. */
  readonly detail: string;
  readonly active: boolean;
  /** `false` enquanto a recepção não aprovou: a ficha existe mas não treina. */
  readonly ready: boolean;
}

export interface PanelChoice {
  readonly href: string;
  readonly label: string;
  readonly icon: IconName;
  /** `true` quando é o painel em que a pessoa já está. */
  readonly active: boolean;
}

export function ContextSwitcher({
  profiles,
  panels,
  switchAction,
  /**
   * Para onde ir depois de trocar de ficha.
   *
   * No painel do aluno, lugar nenhum — a própria tela recarrega no perfil
   * novo. No /admin é `/painel`, senão a troca acontece no cookie e nada na
   * tela muda, o que se lê como botão quebrado.
   */
  goTo,
}: {
  readonly profiles: readonly ProfileChoice[];
  readonly panels: readonly PanelChoice[];
  readonly switchAction: (form: FormData) => void | Promise<void>;
  readonly goTo?: '/painel';
}) {
  const atual = profiles.find((item) => item.active) ?? null;
  const painelAtual = panels.find((item) => item.active) ?? null;

  // Com uma ficha só e nenhum outro painel, não há o que trocar.
  if (profiles.length <= 1 && panels.filter((item) => !item.active).length === 0) {
    return null;
  }

  const rotulo = atual ? (atual.name.split(' ')[0] ?? atual.name) : (painelAtual?.label ?? 'Conta');

  return (
    <details className="group relative">
      <summary
        className={cn(
          'flex min-h-[44px] cursor-pointer list-none items-center gap-2 rounded-xl border border-hairline bg-white/[.04] px-2.5 text-sm font-medium text-foreground transition-colors hover:border-white/25',
          '[&::-webkit-details-marker]:hidden',
        )}
        aria-label="Trocar de perfil ou de painel"
      >
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-hairline bg-white/[.06] font-display text-[11px] text-muted"
        >
          {atual ? initials(atual.name) : <Icon name="conta" className="h-3.5 w-3.5" />}
        </span>
        <span className="hidden max-w-[9rem] truncate sm:block">{rotulo}</span>
        <Icon
          name="mais"
          className="h-3.5 w-3.5 shrink-0 opacity-60 transition-transform group-open:rotate-45"
        />
      </summary>

      {/*
        A gaveta é ancorada à direita e tem largura própria: no celular ela
        ficaria metade fora da tela se seguisse a largura do botão.
      */}
      <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-72 overflow-hidden rounded-2xl border border-hairline bg-surface shadow-2xl">
        {profiles.length > 1 ? (
          <section className="border-b border-hairline p-2">
            <h2 className="stat-label px-2 pb-1.5">Quem está treinando</h2>

            <ul className="space-y-0.5">
              {profiles.map((profile) => (
                <li key={profile.id}>
                  <form action={switchAction}>
                    <input type="hidden" name="studentId" value={profile.id} />
                    {goTo ? <input type="hidden" name="goTo" value={goTo} /> : null}
                    <button
                      type="submit"
                      aria-current={profile.active ? 'true' : undefined}
                      className={cn(
                        'flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors',
                        profile.active
                          ? 'bg-white/[.07]'
                          : 'hover:bg-white/[.04]',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-hairline bg-white/[.06] font-display text-[11px] text-muted"
                      >
                        {initials(profile.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {profile.name.split(' ')[0]}
                        </span>
                        <span
                          className={cn(
                            'block truncate text-[11px]',
                            profile.ready ? 'text-muted' : 'text-amber-300',
                          )}
                        >
                          {profile.detail}
                        </span>
                      </span>
                      {profile.active ? (
                        <span
                          aria-hidden="true"
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                        />
                      ) : null}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/*
          Os painéis. É aqui que mora a coexistência: a lista de fichas acima
          não substitui esta, e o pai que dá aula vê as duas.
        */}
        {panels.length > 0 ? (
          <section className="p-2">
            <h2 className="stat-label px-2 pb-1.5">Painéis</h2>

            <ul className="space-y-0.5">
              {panels.map((panel) => (
                <li key={panel.href}>
                  <Link
                    href={panel.href}
                    aria-current={panel.active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-[44px] items-center gap-2.5 rounded-lg px-2 text-sm font-medium transition-colors',
                      panel.active
                        ? 'bg-white/[.07] text-foreground'
                        : 'text-muted hover:bg-white/[.04] hover:text-foreground',
                    )}
                  >
                    <Icon
                      name={panel.icon}
                      className={cn('h-4 w-4 shrink-0', panel.active ? 'text-accent' : 'opacity-70')}
                    />
                    <span className="min-w-0 flex-1 truncate">{panel.label}</span>
                    {panel.active ? (
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                      />
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </details>
  );
}
