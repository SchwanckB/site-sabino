import { faq } from '@/data/seed';
import { siteConfig, siteUrl } from '@/lib/site';

/**
 * Dados estruturados para SEO local.
 *
 * `SportsActivityLocation` já herda de `LocalBusiness`, então um único nó
 * cobre os dois tipos. O `postalCode` só entra quando estiver preenchido —
 * não vale publicar um CEP que ainda não foi confirmado.
 */
export function JsonLd() {
  const url = siteUrl();
  const { address, openingHours, social } = siteConfig;

  const postalAddress: Record<string, string> = {
    '@type': 'PostalAddress',
    streetAddress: `${address.street} - ${address.district}`,
    addressLocality: address.city,
    addressRegion: address.state,
    addressCountry: siteConfig.country,
  };

  if (address.postalCode.length > 0) {
    postalAddress['postalCode'] = address.postalCode;
  }

  const data = {
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    '@id': `${url}/#academia`,
    name: siteConfig.name,
    legalName: siteConfig.legalName,
    description: siteConfig.description,
    url,
    logo: `${url}/logo.png`,
    image: `${url}/og-image.png`,
    telephone: `+${siteConfig.whatsappNumber}`,
    address: postalAddress,
    areaServed: {
      '@type': 'City',
      name: `${siteConfig.city}, ${siteConfig.stateName}`,
    },
    sameAs: [social.instagram],
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: openingHours.trainingWindow.start,
        closes: openingHours.trainingWindow.end,
      },
    ],
    sport: ['Brazilian Jiu-Jitsu', 'Mixed Martial Arts'],
    knowsLanguage: 'pt-BR',
  };

  /**
   * O acordeão só monta o painel aberto, então as respostas fechadas não ficam
   * no HTML. Este bloco entrega o FAQ aos buscadores — e publica apenas o que
   * já foi confirmado pela academia, nunca uma resposta ainda de exemplo.
   */
  const confirmedFaq = faq.filter((item) => !item.isExample);

  const faqData =
    confirmedFaq.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          '@id': `${url}/#faq`,
          mainEntity: confirmedFaq.map((item) => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: { '@type': 'Answer', text: item.answer },
          })),
        }
      : null;

  const serialize = (value: unknown): string =>
    JSON.stringify(value).replace(/</g, '\\u003c');

  return (
    <>
      <script
        type="application/ld+json"
        // O conteúdo é gerado no servidor a partir de constantes locais.
        dangerouslySetInnerHTML={{ __html: serialize(data) }}
      />
      {faqData ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serialize(faqData) }}
        />
      ) : null}
    </>
  );
}
