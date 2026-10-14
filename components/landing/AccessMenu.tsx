'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

interface AccessOption {
  readonly href: string;
  readonly label: string;
  readonly hint: string;
}

const ALUNO_OPTIONS: readonly AccessOption[] = [
  {
    href: '/cadastro',
    label: 'Fazer pré-cadastro',
    hint: 'Primeira vez aqui — a academia aprova e libera seu acesso',
  },
  {
    href: '/entrar',
    label: 'Entrar no meu painel',
    hint: 'Já sou aluno aprovado',
  },
];

const PROFESSOR_OPTIONS: readonly AccessOption[] = [
  {
    href: '/entrar',
    label: 'Entrar no painel',
    hint: 'Aprovações, presença, financeiro e graduação',
  },
];

/**
 * Acesso à área restrita, separado por quem você é.
 *
 * O destino depois do login é o mesmo para os dois — quem decide é o papel da
 * conta, não o botão clicado. A separação existe porque "sou aluno" e "sou
 * professor" é como as pessoas pensam ao chegar, não "quero autenticar".
 */
function AccessDropdown({
  label,
  options,
  align = 'right',
}: {
  readonly label: string;
  readonly options: readonly AccessOption[];
  readonly align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        className={cn(
          'inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3.5 text-sm font-medium transition-colors duration-300',
          open
            ? 'border-white/20 bg-white/[.08] text-foreground'
            : 'border-hairline bg-white/[.04] text-muted hover:text-foreground',
        )}
      >
        {label}
        <motion.span
          aria-hidden="true"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.25 }}
          className="text-[10px] leading-none"
        >
          ▾
        </motion.span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            id={menuId}
            role="menu"
            aria-label={label}
            initial={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'absolute top-[calc(100%+0.5rem)] z-50 w-72 overflow-hidden rounded-2xl border border-hairline bg-surface shadow-soft',
              align === 'right' ? 'right-0' : 'left-0',
            )}
          >
            <ul className="divide-y divide-hairline">
              {options.map((option) => (
                <li key={`${label}-${option.label}`}>
                  <Link
                    href={option.href}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="block px-4 py-3.5 transition-colors hover:bg-white/[.05]"
                  >
                    <span className="block text-sm font-medium text-foreground">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted">
                      {option.hint}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Par de botões do header, no desktop. */
export function AccessMenu() {
  return (
    <div className="flex items-center gap-2">
      <AccessDropdown label="Aluno" options={ALUNO_OPTIONS} />
      <AccessDropdown label="Professor" options={PROFESSOR_OPTIONS} />
    </div>
  );
}

/** Mesma navegação, aberta em lista, para o menu mobile. */
export function AccessLinksMobile({ onNavigate }: { readonly onNavigate: () => void }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-crimson">Aluno</p>
        <ul className="mt-2 space-y-1">
          {ALUNO_OPTIONS.map((option) => (
            <li key={`aluno-${option.label}`}>
              <Link
                href={option.href}
                onClick={onNavigate}
                className="flex min-h-[48px] flex-col justify-center"
              >
                <span className="text-sm font-medium text-foreground">{option.label}</span>
                <span className="text-xs text-muted">{option.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-crimson">Professor</p>
        <ul className="mt-2 space-y-1">
          {PROFESSOR_OPTIONS.map((option) => (
            <li key={`professor-${option.label}`}>
              <Link
                href={option.href}
                onClick={onNavigate}
                className="flex min-h-[48px] flex-col justify-center"
              >
                <span className="text-sm font-medium text-foreground">{option.label}</span>
                <span className="text-xs text-muted">{option.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
