'use client';

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
} from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { AccessLinksMobile, AccessMenu } from '@/components/landing/AccessMenu';
import { useActiveSection } from '@/components/landing/useActiveSection';
import { navLinks, siteConfig, whatsappLink, whatsappMessages } from '@/lib/site';
import { cn } from '@/lib/utils';

const navHrefs = navLinks.map((link) => link.href);

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const activeSection = useActiveSection(navHrefs);

  /*
   * Progresso da leitura.
   *
   * A mola tira o serrilhado do scroll por toque, que chega em saltos. Sem
   * ela a barra "pula" a cada evento em vez de correr.
   */
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 180,
    damping: 30,
    restDelta: 0.001,
  });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Trava a rolagem do fundo enquanto o menu mobile esta aberto.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-500 ease-organic',
        scrolled
          ? 'border-b border-hairline bg-ink/85 backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      {/*
        Barra de progresso na borda de baixo do cabeçalho. Só aparece depois de
        sair do topo: parada em zero ela só somaria um traço sem significado.
      */}
      <motion.div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-gradient-to-r from-crimson to-accent"
        style={{ scaleX: progress, opacity: scrolled ? 1 : 0 }}
      />

      <div className="container-page flex h-20 items-center justify-between gap-4">
        <Link
          href="/"
          className="relative z-10 flex items-center"
          aria-label={`${siteConfig.name} - inicio`}
          onClick={closeMenu}
        >
          <Image
            src="/logo-light.png"
            alt={`${siteConfig.name} - Jiu-Jitsu e MMA`}
            width={1400}
            height={1204}
            priority
            className="h-12 w-auto sm:h-14"
          />
        </Link>

        <nav aria-label="Navegacao principal" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = activeSection === link.href;

              return (
                <li key={link.href}>
                  <a
                    href={link.href}
                    aria-current={isActive ? 'true' : undefined}
                    className={cn(
                      'relative inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium transition-colors',
                      isActive ? 'text-foreground' : 'text-muted hover:text-foreground',
                    )}
                  >
                    {link.label}
                    {/*
                      Um único elemento com `layoutId` desliza entre os itens em
                      vez de cinco sublinhados acendendo e apagando: o traço
                      acompanha a leitura, e o olho segue o movimento.
                    */}
                    {isActive ? (
                      <motion.span
                        aria-hidden="true"
                        layoutId="nav-ativo"
                        className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-accent"
                        transition={
                          reduceMotion
                            ? { duration: 0 }
                            : { type: 'spring', stiffness: 380, damping: 32 }
                        }
                      />
                    ) : null}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <AccessMenu />
          <a
            href={whatsappLink(whatsappMessages.trial)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
          >
            Aula experimental
          </a>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="menu-mobile"
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          className="relative z-10 -mr-2 flex h-11 w-11 items-center justify-center rounded-xl text-foreground lg:hidden"
        >
          <span className="sr-only">{menuOpen ? 'Fechar menu' : 'Abrir menu'}</span>
          <span aria-hidden="true" className="flex h-4 w-6 flex-col justify-between">
            <motion.span
              className="block h-[2px] w-full origin-center rounded-full bg-current"
              animate={menuOpen ? { rotate: 45, y: 7 } : { rotate: 0, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
            />
            <motion.span
              className="block h-[2px] w-full rounded-full bg-current"
              animate={menuOpen ? { opacity: 0, x: -8 } : { opacity: 1, x: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
            />
            <motion.span
              className="block h-[2px] w-full origin-center rounded-full bg-current"
              animate={menuOpen ? { rotate: -45, y: -7 } : { rotate: 0, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
            />
          </span>
        </button>
      </div>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            id="menu-mobile"
            key="menu-mobile"
            initial={{ opacity: 0, y: reduceMotion ? 0 : -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -12 }}
            transition={{ duration: reduceMotion ? 0.15 : 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-0 top-0 h-dvh border-b border-hairline bg-ink lg:hidden"
          >
            {/*
              O menu rola quando não cabe. Com `justify-center` puro, conteúdo
              mais alto que a tela tem o topo cortado para fora da viewport —
              os primeiros itens sumiam atrás da logo em telas de 320px.
              `min-h-full` deixa o bloco crescer e a rolagem assume.
            */}
            <div className="h-full overflow-y-auto overscroll-contain">
              <div className="container-page flex min-h-full flex-col justify-center pb-12 pt-24">
              <nav aria-label="Navegacao principal (mobile)">
                <ul className="flex flex-col gap-1">
                  {navLinks.map((link, index) => (
                    <motion.li
                      key={link.href}
                      initial={{ opacity: 0, x: reduceMotion ? 0 : -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: reduceMotion ? 0 : 0.06 * index + 0.08,
                        duration: 0.4,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="border-b border-hairline last:border-b-0"
                    >
                      <a
                        href={link.href}
                        onClick={closeMenu}
                        aria-current={activeSection === link.href ? 'true' : undefined}
                        className={cn(
                          'flex min-h-[56px] items-center gap-3 font-display text-2xl uppercase tracking-tight transition-colors',
                          activeSection === link.href
                            ? 'text-accent'
                            : 'text-foreground hover:text-accent',
                        )}
                      >
                        {activeSection === link.href ? (
                          <span aria-hidden="true" className="h-5 w-0.5 rounded-full bg-accent" />
                        ) : null}
                        {link.label}
                      </a>
                    </motion.li>
                  ))}
                </ul>
              </nav>

              <div className="mt-8 border-t border-hairline pt-6">
                <AccessLinksMobile onNavigate={closeMenu} />
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <a
                  href={whatsappLink(whatsappMessages.trial)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={closeMenu}
                  className="btn-primary w-full"
                >
                  Agendar aula experimental
                </a>
                <a href={`tel:+${siteConfig.whatsappNumber}`} className="btn-secondary w-full">
                  {siteConfig.phoneDisplay}
                </a>
              </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
