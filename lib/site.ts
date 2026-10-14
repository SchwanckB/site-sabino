/**
 * Fonte unica de contatos, URLs e textos que aparecem em mais de um lugar
 * (header, rodape, metadata, JSON-LD).
 *
 * Dados confirmados pela academia. O que ainda for placeholder fica marcado
 * com `isExample` e exibe aviso visivel na interface.
 */

export const siteConfig = {
  name: 'Sabino Academia',
  shortName: 'Sabino',
  legalName: 'Sabino Academia de Jiu-Jitsu e MMA',
  tagline: 'Jiu-Jitsu e MMA em Três Cachoeiras/RS',
  description:
    'Academia de Jiu-Jitsu e MMA em Três Cachoeiras/RS. Jiu-Jitsu adulto, MMA, turma feminina e Jiu-Jitsu infantil a partir dos 4 anos, com acompanhamento de graduação do primeiro dia em diante.',

  /** Número oficial que aparece na logo. Formato internacional, só dígitos. */
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '5551981691373',
  phoneDisplay: '(51) 98169-1373',

  city: 'Três Cachoeiras',
  state: 'RS',
  stateName: 'Rio Grande do Sul',
  country: 'BR',

  address: {
    isExample: false,
    street: 'Rua Josué Maggi, 155',
    district: 'Centro',
    reference: 'atrás da Escola Angelina Maggi',
    city: 'Três Cachoeiras',
    state: 'RS',
    postalCode: '95580-000',
  },

  mapEmbedUrl:
    'https://www.google.com/maps?q=Rua+Josu%C3%A9+Maggi%2C+155+-+Centro%2C+Tr%C3%AAs+Cachoeiras+-+RS&z=17&output=embed',
  mapLinkUrl:
    'https://www.google.com/maps/search/?api=1&query=Rua+Josu%C3%A9+Maggi%2C+155+-+Centro%2C+Tr%C3%AAs+Cachoeiras+-+RS',

  social: {
    isExample: false,
    instagram: 'https://instagram.com/sabinoacademia',
    instagramHandle: '@sabinoacademia',
  },

  /** Atendimento confirmado pela academia. */
  openingHours: {
    isExample: false,
    whatsapp: 'WhatsApp em horário comercial',
    reception: 'Recepção aberta durante os treinos, de segunda a sexta, das 18h30 às 21h30',
    trainingWindow: { start: '18:30', end: '21:30' },
  },
} as const;

export type SiteConfig = typeof siteConfig;

/** Endereço em uma linha, como aparece no rodapé e no JSON-LD. */
export function formatAddress(): string {
  const { street, district, city, state } = siteConfig.address;
  return `${street} - ${district}, ${city}/${state}`;
}

/** Monta o link do WhatsApp com a mensagem já preenchida. */
export function whatsappLink(message: string): string {
  return `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

export const whatsappMessages = {
  trial: 'Olá! Vim pelo site e quero agendar as duas aulas experimentais gratuitas.',
  plans: 'Olá! Vim pelo site e quero saber mais sobre os planos.',
  schedule: 'Olá! Vim pelo site e quero confirmar os horários das turmas.',
  kids: 'Olá! Vim pelo site e quero saber sobre as turmas infantis.',
  women: 'Olá! Vim pelo site e quero saber sobre a turma feminina de Jiu-Jitsu.',
} as const;

/** URL pública do site, usada em metadata, Open Graph e JSON-LD. */
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
  { href: '#horarios', label: 'Horários' },
  { href: '#duvidas', label: 'Dúvidas' },
  { href: '#onde-estamos', label: 'Onde estamos' },
] as const;
