import type { Metadata } from 'next';

import { About } from '@/components/landing/About';
import { Benefits } from '@/components/landing/Benefits';
import { Faq } from '@/components/landing/Faq';
import { Footer } from '@/components/landing/Footer';
import { Header } from '@/components/landing/Header';
import { Hero } from '@/components/landing/Hero';
import { JsonLd } from '@/components/landing/JsonLd';
import { LocationSection } from '@/components/landing/LocationSection';
import { Modalities } from '@/components/landing/Modalities';
import { Plans } from '@/components/landing/Plans';
import { ScheduleSection } from '@/components/landing/ScheduleSection';
import { Testimonials } from '@/components/landing/Testimonials';
import { WhatsappFab } from '@/components/landing/WhatsappFab';
import { getPlans } from '@/lib/repositories/plansAdmin';
import { getSchedule } from '@/lib/schedule';
import { siteConfig, siteUrl } from '@/lib/site';

/** A grade vem do Redis; revalida de hora em hora. */
export const revalidate = 3600;

export function generateMetadata(): Metadata {
  const url = siteUrl();
  const title = `${siteConfig.name} | Jiu-Jitsu e MMA em ${siteConfig.city}/${siteConfig.state}`;

  return {
    title: {
      absolute: title,
    },
    description: siteConfig.description,
    keywords: [
      'jiu-jitsu Três Cachoeiras',
      'MMA Três Cachoeiras',
      'academia de luta Três Cachoeiras RS',
      'jiu-jitsu infantil Três Cachoeiras',
      'jiu-jitsu feminino RS',
      'defesa pessoal Três Cachoeiras',
      'academia Sabino',
    ],
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      url,
      siteName: siteConfig.name,
      title,
      description: siteConfig.description,
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: `${siteConfig.name} - Jiu-Jitsu e MMA em ${siteConfig.city}/${siteConfig.state}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: siteConfig.description,
      images: ['/og-image.png'],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
    },
  };
}

export default async function HomePage() {
  const [schedule, planSet] = await Promise.all([getSchedule(), getPlans()]);

  return (
    <>
      <JsonLd />
      <Header />

      {/*
        `overflow-x: clip` contem os deslocamentos horizontais das animacoes de
        entrada sem criar um container de rolagem - diferente de `hidden`, nao
        quebra `position: sticky` nem a rolagem suave das ancoras.
      */}
      <main id="conteudo" className="overflow-x-clip">
        <Hero />
        <About />
        <Modalities />
        <Benefits />
        <Plans plans={planSet.plans} />
        <ScheduleSection schedule={schedule} />
        <Testimonials />
        <Faq />
        <LocationSection />
      </main>

      <Footer />
      <WhatsappFab />
    </>
  );
}
