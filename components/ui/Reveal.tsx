'use client';

import { motion, useReducedMotion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

const OFFSET = 28;

function offsetFor(direction: Direction): { x: number; y: number } {
  switch (direction) {
    case 'up':
      return { x: 0, y: OFFSET };
    case 'down':
      return { x: 0, y: -OFFSET };
    case 'left':
      return { x: OFFSET, y: 0 };
    case 'right':
      return { x: -OFFSET, y: 0 };
    case 'none':
      return { x: 0, y: 0 };
  }
}

interface RevealProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly delay?: number;
  readonly duration?: number;
  readonly direction?: Direction;
  readonly as?: 'div' | 'section' | 'li' | 'article' | 'header' | 'footer';
}

/**
 * fade-in + slide-up ao entrar na viewport, uma unica vez.
 * Com `prefers-reduced-motion` o conteudo aparece sem deslocamento.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  duration = 0.55,
  direction = 'up',
  as = 'div',
}: RevealProps) {
  const reduceMotion = useReducedMotion();
  const { x, y } = offsetFor(direction);
  // Cast estreita a uniao de componentes do proxy do Framer Motion para um tipo
  // unico; em runtime o componente correto (section, li, ...) e preservado.
  const Component = motion[as] as typeof motion.div;

  return (
    <Component
      className={className}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x, y }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, amount: 0.2, margin: '0px 0px -80px 0px' }}
      transition={{
        duration: reduceMotion ? 0.2 : duration,
        delay: reduceMotion ? 0 : delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </Component>
  );
}

/**
 * Container de lista com `stagger`. Use junto de {@link StaggerItem}.
 */
export function Stagger({
  children,
  className,
  step = 0.08,
  as = 'div',
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly step?: number;
  readonly as?: 'div' | 'ul' | 'ol';
}) {
  const reduceMotion = useReducedMotion();
  const Component = motion[as] as typeof motion.div;

  const variants: Variants = {
    hidden: {},
    visible: {
      transition: { staggerChildren: reduceMotion ? 0 : step, delayChildren: 0.05 },
    },
  };

  return (
    <Component
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15, margin: '0px 0px -60px 0px' }}
    >
      {children}
    </Component>
  );
}

export function StaggerItem({
  children,
  className,
  as = 'div',
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly as?: 'div' | 'li' | 'article';
}) {
  const reduceMotion = useReducedMotion();
  const Component = motion[as] as typeof motion.div;

  const variants: Variants = {
    hidden: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: reduceMotion ? 0.2 : 0.5, ease: [0.22, 1, 0.36, 1] },
    },
  };

  return (
    <Component className={className} variants={variants}>
      {children}
    </Component>
  );
}

/** Cabecalho de secao: eyebrow + titulo + texto de apoio. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  className,
  id,
}: {
  readonly eyebrow: string;
  readonly title: ReactNode;
  readonly description?: string;
  readonly align?: 'left' | 'center';
  readonly className?: string;
  readonly id?: string;
}) {
  return (
    <Reveal
      className={cn(
        'max-w-2xl',
        align === 'center' && 'mx-auto text-center',
        className,
      )}
    >
      <p className="eyebrow">{eyebrow}</p>
      <h2
        id={id}
        className="mt-3 text-3xl leading-[1.05] sm:text-4xl lg:text-5xl"
      >
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
          {description}
        </p>
      ) : null}
    </Reveal>
  );
}
