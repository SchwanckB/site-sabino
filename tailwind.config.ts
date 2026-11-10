import type { Config } from 'tailwindcss';

/**
 * Design tokens for Sabino Academia.
 * The crimson is intentionally scarce: CTAs, active states and accents only.
 *
 * Crimson has two tokens because one colour cannot do both jobs on a dark
 * ground: `crimson` is a fill (white sits on it at 6.2:1), while `crimson`
 * as *text* on `ink` reads only 3.1:1 and fails AA. Text takes `accent`.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './data/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#0E0E10',
        surface: '#17171A',
        'surface-raised': '#1F1F23',
        hairline: 'rgba(255,255,255,.08)',
        foreground: '#F5F5F5',
        muted: '#B4B4BE',
        crimson: {
          DEFAULT: '#C1121F',
          hover: '#D81B28',
        },
        /** Carmesim legível como texto: 5.1:1 na superfície mais clara. */
        accent: '#EC6269',
        belt: {
          branca: '#E8E8E8',
          azul: '#1D4ED8',
          roxa: '#6D28D9',
          marrom: '#78350F',
          preta: '#111113',
        },
        stripe: {
          branca: '#F5F5F5',
          vermelha: '#C1121F',
          amarela: '#F2C200',
        },
      },
      borderColor: {
        DEFAULT: 'rgba(255,255,255,.08)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Impact', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
      boxShadow: {
        soft: '0 24px 60px -24px rgba(0,0,0,.75)',
        glow: '0 0 0 1px rgba(193,18,31,.35), 0 18px 48px -18px rgba(193,18,31,.55)',
      },
      maxWidth: {
        container: '1200px',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(1)', opacity: '.6' },
          '100%': { transform: 'scale(1.9)', opacity: '0' },
        },
        /** Varredura de luz: usada no estado de carregamento. */
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        /** Respiro lento do halo do hero. */
        breathe: {
          '0%, 100%': { opacity: '.5', transform: 'scale(1)' },
          '50%': { opacity: '.85', transform: 'scale(1.06)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(.22,1,.36,1) infinite',
        shimmer: 'shimmer 1.6s cubic-bezier(.4,0,.6,1) infinite',
        breathe: 'breathe 9s cubic-bezier(.4,0,.6,1) infinite',
      },
      /*
       * Curvas de movimento.
       *
       * `organic` é a saída desacelerada de quase tudo: entrada de seção,
       * abertura de folha, deslocamento. `snap` é mais curta e serve ao
       * retorno de toque, onde a demora lê como atraso.
       */
      transitionTimingFunction: {
        organic: 'cubic-bezier(.22,1,.36,1)',
        snap: 'cubic-bezier(.32,.72,0,1)',
      },
    },
  },
  plugins: [],
};

export default config;
