'use client';

import { SignOutButton, UserButton } from '@clerk/nextjs';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

export interface NavItem {
  readonly href: string;
  readonly label: string;
  /** Contador opcional, ex.: cadastros pendentes. */
  readonly badge?: number;
}

/**
 * Casca das áreas logadas (admin e aluno).
 *
 * Em telas estreitas a navegação vira uma barra inferior fixa — o polegar
 * alcança, e é assim que a recepção vai usar no celular durante o treino.
 */
export function AppShell({
  items,
  title,
  children,
}: {
  readonly items: readonly NavItem[];
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const isActive = (href: string): boolean =>
    pathname === href || (href !== '/admin' && href !== '/painel' && pathname.startsWith(href));

  return (
    <div className="min-h-dvh bg-ink">
      <header className="sticky top-0 z-40 border-b border-hairline bg-ink/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" aria-label="Sabino Academia — site" className="shrink-0">
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
            <nav aria-label="Navegação" className="hidden lg:block">
              <ul className="flex items-center gap-1">
                {items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive(item.href) ? 'page' : undefined}
                      className={cn(
                        'inline-flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
                        isActive(item.href)
                          ? 'bg-white/[.07] text-foreground'
                          : 'text-muted hover:text-foreground',
                      )}
                    >
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
            </nav>

            {/*
              Sair precisa ser óbvio. Com só o avatar do Clerk, quem queria
              trocar de conta acabava reentrando na mesma sessão sem perceber.
            */}
            <SignOutButton redirectUrl="/">
              <button
                type="button"
                className="hidden min-h-[44px] items-center rounded-xl border border-hairline bg-white/[.04] px-3 text-sm font-medium text-muted transition-colors hover:text-foreground sm:inline-flex"
              >
                Sair
              </button>
            </SignOutButton>

            <UserButton appearance={{ elements: { avatarBox: 'h-9 w-9' } }} />

            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="menu-app"
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-foreground lg:hidden"
            >
              <span aria-hidden="true" className="flex h-4 w-6 flex-col justify-between">
                <motion.span
                  className="block h-[2px] w-full origin-center rounded-full bg-current"
                  animate={menuOpen ? { rotate: 45, y: 7 } : { rotate: 0, y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.3 }}
                />
                <motion.span
                  className="block h-[2px] w-full rounded-full bg-current"
                  animate={menuOpen ? { opacity: 0 } : { opacity: 1 }}
                  transition={{ duration: reduceMotion ? 0 : 0.2 }}
                />
                <motion.span
                  className="block h-[2px] w-full origin-center rounded-full bg-current"
                  animate={menuOpen ? { rotate: -45, y: -7 } : { rotate: 0, y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.3 }}
                />
              </span>
            </button>
          </div>
        </div>

        <AnimatePresence>
          {menuOpen ? (
            <motion.nav
              id="menu-app"
              aria-label="Navegação (mobile)"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0.12 : 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden border-t border-hairline lg:hidden"
            >
              <ul className="mx-auto w-full max-w-6xl px-4 py-2 sm:px-6">
                {items.map((item) => (
                  <li key={item.href} className="border-b border-hairline last:border-b-0">
                    <Link
                      href={item.href}
                      aria-current={isActive(item.href) ? 'page' : undefined}
                      className={cn(
                        'flex min-h-[52px] items-center justify-between gap-3 text-sm font-medium',
                        isActive(item.href) ? 'text-crimson' : 'text-foreground',
                      )}
                    >
                      {item.label}
                      {item.badge && item.badge > 0 ? (
                        <span className="rounded-full bg-crimson px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
                <li className="pt-2">
                  <SignOutButton redirectUrl="/">
                    <button
                      type="button"
                      className="flex min-h-[52px] w-full items-center text-sm font-medium text-crimson"
                    >
                      Sair da conta
                    </button>
                  </SignOutButton>
                </li>
              </ul>
            </motion.nav>
          ) : null}
        </AnimatePresence>
      </header>

      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
