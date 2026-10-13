/**
 * Single source of truth for contact details, URLs and copy that appears in
 * more than one place (header, footer, metadata, JSON-LD).
 *
 * Anything flagged `isExample` is placeholder content - replace it before
 * going live. The phone number comes from the official logo, so it is real.
 */

export const siteConfig = {
  name: 'Sabino Academia',
  shortName: 'Sabino',
  legalName: 'Sabino Academia de Jiu-Jitsu e MMA',
  tagline: 'Jiu-Jitsu e MMA em Torres, no litoral gaucho',
  description:
    'Academia de Jiu-Jitsu e MMA em Torres/RS. Turmas de Jiu-Jitsu adulto, MMA e Jiu-Jitsu Kids, com acompanhamento individual do primeiro dia a faixa preta.',

  /** Numero oficial que aparece na logo. Formato internacional, so digitos. */
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '5551981691373',
  phoneDisplay: '(51) 98169-1373',

  city: 'Torres',
  state: 'RS',
  stateName: 'Rio Grande do Sul',
  country: 'BR',

  /** EXEMPLO - substituir pelo endereco real da academia. */
  address: {
    isExample: true,
    street: 'Rua Exemplo, 000',
    district: 'Centro',
    city: 'Torres',
    state: 'RS',
    postalCode: '95560-000',
  },

  /** Mapa em nivel de cidade - nao expoe um endereco que ainda nao foi confirmado. */
  mapEmbedUrl: 'https://www.google.com/maps?q=Torres,RS,Brasil&z=13&output=embed',
  mapLinkUrl: 'https://www.google.com/maps/search/?api=1&query=Torres%2C+RS%2C+Brasil',

  /** EXEMPLO - substituir pelos perfis reais. */
  social: {
    isExample: true,
    instagram: 'https://instagram.com/',
    facebook: 'https://facebook.com/',
  },

  /** EXEMPLO - confirmar o horario de atendimento da recepcao. */
  openingHours: {
    isExample: true,
    weekdays: 'Segunda a sexta, 06h as 22h',
    saturday: 'Sabado, 09h as 12h',
    sunday: 'Domingo, fechado',
  },
} as const;

export type SiteConfig = typeof siteConfig;

/** Endereco em uma linha, como aparece no rodape e no JSON-LD. */
export function formatAddress(): string {
  const { street, district, city, state } = siteConfig.address;
  return `${street} - ${district}, ${city}/${state}`;
}

/** Monta o link do WhatsApp com a mensagem ja preenchida. */
export function whatsappLink(message: string): string {
  return `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

export const whatsappMessages = {
  trial: 'Ola! Vim pelo site e quero agendar uma aula experimental.',
  plans: 'Ola! Vim pelo site e quero saber mais sobre os planos.',
  schedule: 'Ola! Vim pelo site e quero confirmar os horarios das turmas.',
  kids: 'Ola! Vim pelo site e quero saber sobre a turma Kids.',
} as const;

/** URL publica do site, usada em metadata, Open Graph e JSON-LD. */
export function siteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, '');
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}

export const navLinks = [
  { href: '#modalidades', label: 'Modalidades' },
  { href: '#planos', label: 'Planos' },
  { href: '#horarios', label: 'Horarios' },
  { href: '#duvidas', label: 'Duvidas' },
  { href: '#onde-estamos', label: 'Onde estamos' },
] as const;
