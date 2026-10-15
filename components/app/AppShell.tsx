'use client';

import { SignOutButton, UserButton } from '@clerk/nextjs';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Icon, type IconName } from '@/components/app/Icon';
import { cn } from '@/lib/utils';

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
  children,
}: {
  readonly items: readonly NavItem[];
  readonly title: string;
  readonly primaryAction?: PrimaryAction;
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

  return (
    <div className="min-h-dvh bg-ink">
      <header className="sticky top-0 z-40 border-b border-hairline bg-ink/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
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

          <div className="flex items-center gap-2">
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
            */}
            <SignOutButton redirectUrl="/">
              <button
                type="button"
                className="hidden min-h-[44px] items-center rounded-xl border border-hairline bg-white/[.04] px-3 text-sm font-medium text-muted transition-colors hover:text-foreground lg:inline-flex"
              >
                Sair
              </button>
            </SignOutButton>

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
          Navegação em linha própria, não disputando espaço com logo e avatar.
          Eram onze itens brigando por ~990px dentro de uma barra de 1024: em
          tablet deitado a página inteira ganhava rolagem horizontal. Numa faixa
          dedicada com `overflow-x-auto`, o excesso rola dentro da faixa e nunca
          alarga o documento — e continua valendo quando novas páginas entrarem.
        */}
        <nav aria-label="Navegação" className="hidden border-t border-hairline lg:block">
          {/*
            Sem o limite de 1152px do conteúdo: a faixa usa a tela toda, e a
            partir de ~1300px os onze itens aparecem de uma vez. Abaixo disso
            ela rola, e a sombra na borda direita avisa que há mais.
          */}
          <div className="w-full overflow-x-auto px-4 [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ul className="flex w-max items-center gap-0.5 py-1 pr-10">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? 'page' : undefined}
                    className={cn(
                      'inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm font-medium transition-colors',
                      isActive(item.href)
                        ? 'bg-white/[.07] text-foreground'
                        : 'text-muted hover:text-foreground',
                    )}
                  >
                    <Icon name={item.icon} className="h-4 w-4 opacity-70" />
                    {item.label}
                    {item.badge && item.badge > 0 ? (
                      <span className="rounded-full bg-crimson px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </header>

      {/*
        O padding de baixo reserva a altura da barra fixa mais o recorte do
        iPhone. Sem isso o último cartão fica debaixo da barra e o professor
        não alcança o botão de salvar.
      */}
      <main
        id="conteudo"
        className="mx-auto w-full max-w-6xl px-4 pb-32 pt-8 sm:px-6 sm:pt-10 lg:pb-10"
        style={{ paddingBottom: 'calc(8rem + env(safe-area-inset-bottom))' }}
      >
        {children}
      </main>

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

              <ul className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
                {items.map((item) => (
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
                          className={cn('h-6 w-6', isActive(item.href) ? 'text-crimson' : 'text-muted')}
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

              <div className="px-4">
                <SignOutButton redirectUrl="/">
                  <button
                    type="button"
                    className="flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-crimson/40 bg-crimson/[.08] text-sm font-semibold text-crimson"
                  >
                    Sair da conta
                  </button>
                </SignOutButton>
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
          active ? 'text-crimson' : 'text-muted active:text-foreground',
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
