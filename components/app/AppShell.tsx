'use client';

import { UserButton } from '@clerk/nextjs';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Icon, type IconName } from '@/components/app/Icon';
import { LogoutButton } from '@/components/app/LogoutButton';
import { UnitSwitcher } from '@/components/app/UnitSwitcher';
import { cn } from '@/lib/utils';
import type { UnitScope } from '@/types/domain';

export interface NavItem {
  readonly href: string;
  readonly label: string;
  /** Contador opcional, ex.: cadastros pendentes. */
  readonly badge?: number;
  readonly icon: IconName;
  /** Aparece na barra inferior do celular. No máximo quatro. */
  readonly primary?: boolean;
  /** Rótulo curto para a barra inferior, onde cada aba tem ~60px em 320px. */
  readonly short?: string;
  /**
   * Seção do menu. Itens vizinhos com o mesmo valor viram um bloco.
   *
   * O admin tem quatorze páginas. Chapadas, obrigam a ler a lista inteira
   * para achar uma — e a lista está em ordem de nada. Em quatro blocos, a
   * varredura cai de quatorze itens para quatro. O painel do aluno tem cinco
   * itens e não usa isto: ali o agrupamento só somaria ruído.
   */
  readonly group?: string;
}

export interface PrimaryAction {
  readonly href: string;
  readonly label: string;
  readonly icon: IconName;
  /** Texto curto embaixo do botão redondo. */
  readonly short: string;
}

/**
 * Casca das áreas logadas (admin e aluno).
 *
 * No celular a navegação é uma barra inferior fixa com a ação principal num
 * botão redondo elevado no centro — o aluno abre o painel e o leitor de QR
 * está sob o polegar, sem procurar menu. É o gesto que ele repete três vezes
 * por semana na porta da academia; tudo o mais pode custar um toque a mais.
 *
 * No desktop a navegação volta a ser uma faixa horizontal sob o cabeçalho.
 */
export function AppShell({
  items,
  title,
  primaryAction,
  unitScope,
  children,
}: {
  readonly items: readonly NavItem[];
  readonly title: string;
  readonly primaryAction?: PrimaryAction;
  /** Só no admin: recorte de academia mostrado no cabeçalho. */
  readonly unitScope?: {
    readonly value: UnitScope;
    readonly action: (form: FormData) => void | Promise<void>;
  };
  readonly children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Com a folha aberta, travar o fundo evita a rolagem fantasma do iOS.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  const isActive = (href: string): boolean => {
    // Atalho para uma seção da própria página: nunca marca como destino atual,
    // senão "Mensalidade" e "Frequência" acendem juntas em cima de /painel.
    if (href.includes('#')) return false;
    return (
      pathname === href || (href !== '/admin' && href !== '/painel' && pathname.startsWith(href))
    );
  };

  const marcados = items.filter((item) => item.primary);
  const atalhos = (marcados.length > 0 ? marcados : items).slice(0, 4);
  // Com ação central, sobram dois slots de cada lado.
  const esquerda = primaryAction ? atalhos.slice(0, 2) : atalhos.slice(0, 2);
  const direita = primaryAction ? atalhos.slice(2, 3) : atalhos.slice(2, 4);

  const pendentes = items.reduce((soma, item) => soma + (item.badge ?? 0), 0);

  // Blocos na ordem em que foram declarados — quem monta a lista decide o
  // agrupamento, e a casca só respeita. Sem `group`, sai um bloco só.
  const grupos = items.reduce<{ label: string; items: NavItem[] }[]>((acc, item) => {
    const label = item.group ?? '';
    const atual = acc[acc.length - 1];
    if (atual && atual.label === label) atual.items.push(item);
    else acc.push({ label, items: [item] });
    return acc;
  }, []);

  return (
    <div className="min-h-dvh bg-ink">
      {/*
        Coluna lateral (desktop) -------------------------------------------

        Eram quinze itens numa faixa horizontal de ~990px dentro de 1024: os
        quatro blocos existiam nos dados, mas na faixa não cabia rótulo de
        seção sem dobrar a altura do cabeçalho — sobrava um tracinho mudo
        entre eles, e abaixo de ~1300px a faixa ainda rolava de lado.

        Na vertical o rótulo cabe. "Dinheiro" e "Academia" viram cabeçalho de
        verdade, os quinze itens aparecem de uma vez sem rolagem, e a varredura
        volta a ser de quatro blocos em vez de quinze linhas.
      */}
      <aside className="hidden border-r border-hairline bg-surface/30 lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64 lg:flex-col">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-hairline px-5">
          <Link
            href="/"
            aria-label="Sabino Academia — site"
            className="flex min-h-[44px] shrink-0 items-center"
          >
            <Image src="/logo-light.png" alt="" width={1400} height={1204} className="h-9 w-auto" />
          </Link>
          <span className="min-w-0 truncate font-display text-sm uppercase tracking-[0.14em] text-muted">
            {title}
          </span>
        </div>

        {/* A lista rola sozinha se um dia passar da altura da janela. */}
        <nav aria-label="Navegação" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-5">
            {grupos.map((grupo) => (
              <section key={grupo.label || 'geral'}>
                {grupo.label ? (
                  <h2 className="stat-label px-2 pb-1.5">{grupo.label}</h2>
                ) : null}

                <ul className="space-y-0.5">
                  {grupo.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive(item.href) ? 'page' : undefined}
                        className={cn(
                          'group relative flex min-h-[40px] items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors',
                          isActive(item.href)
                            ? 'bg-white/[.07] text-foreground'
                            : 'text-muted hover:bg-white/[.04] hover:text-foreground',
                        )}
                      >
                        {/*
                          Marca da página atual na borda esquerda. A cor sozinha
                          não pode carregar o estado: aqui há forma também.
                        */}
                        {isActive(item.href) ? (
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent"
                          />
                        ) : null}

                        <Icon
                          name={item.icon}
                          className={cn(
                            'h-4 w-4 shrink-0',
                            isActive(item.href) ? 'text-accent' : 'opacity-70',
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>

                        {item.badge && item.badge > 0 ? (
                          <span className="shrink-0 rounded-full bg-crimson px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </nav>

        <div className="shrink-0 border-t border-hairline p-3">
          <LogoutButton
            label="Sair da conta"
            className="flex min-h-[40px] w-full items-center justify-center rounded-lg border border-hairline bg-white/[.03] text-sm font-medium text-muted transition-colors hover:text-foreground"
          />
        </div>
      </aside>

      {/* Conteúdo, deslocado para o lado da coluna no desktop ------------- */}
      <div className="lg:pl-64">
      <header className="sticky top-0 z-30 border-b border-hairline bg-ink/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          {/* No desktop a identidade já está na coluna; aqui ela só repetiria. */}
          <div className="flex min-w-0 items-center gap-3 lg:hidden">
            <Link
              href="/"
              aria-label="Sabino Academia — site"
              className="flex min-h-[44px] shrink-0 items-center"
            >
              <Image
                src="/logo-light.png"
                alt=""
                width={1400}
                height={1204}
                className="h-9 w-auto"
              />
            </Link>
            <span className="min-w-0 truncate font-display text-sm uppercase tracking-[0.14em] text-muted">
              {title}
            </span>
          </div>

          {/* Empurra os controles para a direita quando a logo sai. */}
          <div className="hidden lg:block lg:flex-1" />

          <div className="flex items-center gap-2">
            {unitScope ? (
              <div className="hidden lg:block">
                <UnitSwitcher scope={unitScope.value} action={unitScope.action} />
              </div>
            ) : null}

            {/* No desktop não há barra inferior: a ação principal vem aqui. */}
            {primaryAction ? (
              <Link
                href={primaryAction.href}
                className="hidden min-h-[44px] items-center gap-2 rounded-xl bg-crimson px-4 text-sm font-semibold text-foreground transition-colors hover:bg-crimson/90 lg:inline-flex"
              >
                <Icon name={primaryAction.icon} className="h-5 w-5" />
                {primaryAction.label}
              </Link>
            ) : null}

            {/*
              Sair precisa ser óbvio. Com só o avatar do Clerk, quem queria
              trocar de conta acabava reentrando na mesma sessão sem perceber.
              No desktop o botão agora fica no pé da coluna lateral.
            */}
            <UserButton
              appearance={{
                elements: {
                  avatarBox: 'h-9 w-9',
                  // O gatilho é o alvo de toque: 44px mesmo com avatar de 36.
                  userButtonTrigger: 'h-11 w-11 justify-center',
                },
              }}
            />
          </div>
        </div>

        {/*
          No celular o cabeçalho já está cheio com logo, título e avatar. O
          seletor ganha uma faixa própria logo abaixo — fica visível o tempo
          todo, que é o ponto: saber de qual academia são os números na tela.
        */}
        {unitScope ? (
          <div className="border-t border-hairline px-4 py-1.5 lg:hidden">
            <UnitSwitcher scope={unitScope.value} action={unitScope.action} />
          </div>
        ) : null}
      </header>

      {/*
        O padding de baixo reserva a altura da barra fixa mais o recorte do
        iPhone. Sem isso o último cartão fica debaixo da barra e o professor
        não alcança o botão de salvar.

        A medida vai na classe, não em `style`: inline ela vencia o `lg:pb-10`
        por especificidade e o desktop — que não tem barra inferior — ficava
        com 8rem de espaço morto no pé de toda tela.
      */}
      <main
        id="conteudo"
        className="mx-auto w-full max-w-6xl px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-8 sm:px-6 sm:pt-10 lg:pb-10"
      >
        {children}
      </main>
      </div>

      {/* Barra inferior (celular e tablet em pé) ----------------------------- */}
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-ink/95 backdrop-blur-xl lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/*
          Abas elásticas, não de largura fixa: em 320px cinco slots fixos de
          68px somavam 340 e a última aba ficava fora da tela. Dividindo o
          espaço disponível, a barra caberia até num aparelho mais estreito.
        */}
        <ul className="mx-auto flex w-full max-w-lg items-end justify-around px-0.5">
          {esquerda.map((item) => (
            <BottomTab key={item.href} item={item} active={isActive(item.href)} />
          ))}

          {primaryAction ? (
            <li className="relative -mt-7 flex w-[4.5rem] shrink-0 flex-col items-center">
              <Link
                href={primaryAction.href}
                aria-label={primaryAction.label}
                className={cn(
                  'flex h-16 w-16 items-center justify-center rounded-full bg-crimson text-foreground shadow-[0_8px_28px_-6px_rgba(214,40,57,.85)]',
                  // O anel da cor do fundo recorta a linha da barra.
                  'ring-4 ring-ink transition-transform active:scale-95',
                )}
              >
                <Icon name={primaryAction.icon} className="h-8 w-8" />
              </Link>
              <span className="pb-1.5 pt-1 text-[11px] font-semibold leading-none text-foreground">
                {primaryAction.short}
              </span>
            </li>
          ) : null}

          {direita.map((item) => (
            <BottomTab key={item.href} item={item} active={isActive(item.href)} />
          ))}

          <li className="min-w-0 max-w-[4.75rem] flex-1">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-expanded={menuOpen}
              aria-controls="menu-app"
              className="relative flex min-h-[56px] w-full flex-col items-center justify-center gap-1 text-muted transition-colors active:text-foreground"
            >
              <Icon name="mais" className="h-6 w-6" />
              <span className="text-[11px] font-medium leading-none">Mais</span>
              {pendentes > 0 ? (
                <span className="absolute right-1.5 top-1.5 min-w-[18px] rounded-full bg-crimson px-1 text-[10px] font-semibold leading-[18px] text-foreground">
                  {pendentes}
                </span>
              ) : null}
            </button>
          </li>
        </ul>
      </nav>

      {/* Folha com o menu completo ------------------------------------------- */}
      <AnimatePresence>
        {menuOpen ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0.1 : 0.2 }}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-40 bg-ink/70 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              id="menu-app"
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{
                duration: reduceMotion ? 0.12 : 0.34,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-hairline bg-ink lg:hidden"
              style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
            >
              <div className="sticky top-0 flex items-center justify-between gap-4 border-b border-hairline bg-ink px-5 py-4">
                <span className="font-display text-sm uppercase tracking-[0.14em] text-muted">
                  {title}
                </span>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Fechar menu"
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-muted"
                >
                  <Icon name="fechar" className="h-5 w-5" />
                </button>
              </div>

              {/*
                Na folha o rótulo do bloco cabe, e é aqui que ele mais serve:
                é no celular que o professor procura a página com o polegar.
              */}
              <div className="space-y-4 p-4">
                {grupos.map((grupo) => (
                  <section key={grupo.label || 'geral'}>
                    {grupo.label ? (
                      <h3 className="stat-label px-1 pb-2">{grupo.label}</h3>
                    ) : null}

                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {grupo.items.map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={isActive(item.href) ? 'page' : undefined}
                            className={cn(
                              'flex min-h-[88px] flex-col justify-between gap-2 rounded-2xl border p-3.5 transition-colors',
                              isActive(item.href)
                                ? 'border-crimson/50 bg-crimson/[.1] text-foreground'
                                : 'border-hairline bg-white/[.04] text-foreground active:border-white/25',
                            )}
                          >
                            <span className="flex items-start justify-between gap-2">
                              <Icon
                                name={item.icon}
                                className={cn(
                                  'h-6 w-6',
                                  isActive(item.href) ? 'text-accent' : 'text-muted',
                                )}
                              />
                              {item.badge && item.badge > 0 ? (
                                <span className="min-w-[20px] rounded-full bg-crimson px-1.5 text-center text-[11px] font-semibold leading-5 text-foreground">
                                  {item.badge}
                                </span>
                              ) : null}
                            </span>
                            <span className="text-sm font-medium leading-snug">{item.label}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>

              <div className="px-4">
                <LogoutButton
                  label="Sair da conta"
                  className="flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-crimson/40 bg-crimson/[.08] text-sm font-semibold text-accent"
                />
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function BottomTab({ item, active }: { readonly item: NavItem; readonly active: boolean }) {
  return (
    <li className="min-w-0 max-w-[4.75rem] flex-1">
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative flex min-h-[56px] w-full flex-col items-center justify-center gap-1 px-0.5 transition-colors',
          active ? 'text-accent' : 'text-muted active:text-foreground',
        )}
      >
        <Icon name={item.icon} className="h-6 w-6 shrink-0" />
        <span className="max-w-full truncate text-[11px] font-medium leading-none">
          {item.short ?? item.label}
        </span>
        {item.badge && item.badge > 0 ? (
          <span className="absolute right-0.5 top-1.5 min-w-[18px] rounded-full bg-crimson px-1 text-[10px] font-semibold leading-[18px] text-foreground">
            {item.badge}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
