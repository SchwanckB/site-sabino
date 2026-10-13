import { siteConfig, siteUrl } from '@/lib/site';

/**
 * Dados estruturados para SEO local.
 *
 * `SportsActivityLocation` ja herda de `LocalBusiness`, entao um unico no
 * cobre os dois tipos exigidos. O `streetAddress` so e publicado quando deixa
 * de ser placeholder - nao vale indexar um endereco que ainda nao existe.
 */
export function JsonLd() {
  const url = siteUrl();
  const { address, openingHours, social } = siteConfig;

  const postalAddress: Record<string, string> = {
    '@type': 'PostalAddress',
    addressLocality: siteConfig.city,
    addressRegion: siteConfig.state,
    addressCountry: siteConfig.country,
  };

  if (!address.isExample) {
    postalAddress['streetAddress'] = `${address.street} - ${address.district}`;
    postalAddress['postalCode'] = address.postalCode;
  }

  const sameAs = social.isExample ? [] : [social.instagram, social.facebook];

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
    ...(sameAs.length > 0 ? { sameAs } : {}),
    ...(openingHours.isExample
      ? {}
      : {
          openingHoursSpecification: [
            {
              '@type': 'OpeningHoursSpecification',
              dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
              opens: '06:00',
              closes: '22:00',
            },
            {
              '@type': 'OpeningHoursSpecification',
              dayOfWeek: ['Saturday'],
              opens: '09:00',
              closes: '12:00',
            },
          ],
        }),
    sport: ['Brazilian Jiu-Jitsu', 'Mixed Martial Arts'],
    knowsLanguage: 'pt-BR',
  };

  return (
    <script
      type="application/ld+json"
      // O conteudo e gerado no servidor a partir de constantes locais.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}
