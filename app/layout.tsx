import { ClerkProvider } from '@clerk/nextjs';
import { ptBR } from '@clerk/localizations';
import type { Metadata, Viewport } from 'next';
import { Inter, Oswald } from 'next/font/google';

import { isClerkConfigured } from '@/lib/env';
import { siteConfig, siteUrl } from '@/lib/site';

import './globals.css';

/** Títulos: condensada, pesada, com cara de cartaz de luta. */
const display = Oswald({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

/** Corpo de texto. */
const body = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${siteConfig.name} | Jiu-Jitsu e MMA em ${siteConfig.city}/${siteConfig.state}`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  authors: [{ name: siteConfig.legalName }],
  creator: siteConfig.legalName,
  publisher: siteConfig.legalName,
  formatDetection: { telephone: true, address: false, email: false },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = {
  themeColor: '#0E0E10',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/** Clerk herda os tokens do design system em vez do tema claro padrão. */
const clerkAppearance = {
  variables: {
    colorPrimary: '#C1121F',
    colorBackground: '#17171A',
    colorInputBackground: '#1F1F23',
    colorText: '#F5F5F5',
    colorTextSecondary: '#A1A1AA',
    colorInputText: '#F5F5F5',
    colorDanger: '#E01E2D',
    borderRadius: '0.75rem',
  },
  elements: {
    card: 'bg-surface border border-hairline shadow-soft',
    headerTitle: 'font-display uppercase tracking-tight',
    formButtonPrimary:
      'bg-crimson hover:bg-crimson-hover text-foreground normal-case font-semibold',
    footerActionLink: 'text-crimson hover:text-crimson-hover',
  },
} as const;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const content = (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-dvh bg-ink text-foreground">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-crimson focus:px-4 focus:py-3 focus:text-sm focus:font-semibold"
        >
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );

  // Sem as chaves do Clerk o provider quebraria a aplicação inteira, inclusive
  // a landing page. Nesse caso o site segue público e as rotas logadas são
  // desviadas para /configurar pelo middleware.
  if (!isClerkConfigured()) {
    return content;
  }

  return (
    <ClerkProvider
      localization={ptBR}
      appearance={clerkAppearance}
      signInUrl="/entrar"
      signUpUrl="/cadastro"
    >
      {content}
    </ClerkProvider>
  );
}
