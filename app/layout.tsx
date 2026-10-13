import type { Metadata, Viewport } from 'next';
import { Inter, Oswald } from 'next/font/google';

import { siteConfig, siteUrl } from '@/lib/site';

import './globals.css';

/** Titulos: condensada, pesada, com cara de cartaz de luta. */
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-dvh bg-ink text-foreground">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-crimson focus:px-4 focus:py-3 focus:text-sm focus:font-semibold"
        >
          Pular para o conteudo
        </a>
        {children}
      </body>
    </html>
  );
}
