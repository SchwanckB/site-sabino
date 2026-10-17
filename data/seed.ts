/**
 * ===========================================================================
 * Conteúdo da landing page
 * ===========================================================================
 *
 * A GRADE DE HORÁRIOS é real, confirmada pela academia.
 *
 * Preços, depoimentos, números e algumas respostas do FAQ ainda são
 * PLACEHOLDERS — cada bloco carrega `isExample` para que a interface sinalize
 * visualmente o que falta revisar.
 *
 * Ao conectar o Upstash Redis, a grade passa a vir de `schedule:classes` e
 * este arquivo continua como fallback. Ver lib/schedule.ts.
 * ===========================================================================
 */

import type { UnitId } from '@/types/domain';

export const EXAMPLE_DATA_NOTICE =
  'Conteúdo de demonstração: valores ainda não confirmados pela academia.';

/* -------------------------------------------------------------------------- */
/* Modalidades                                                                */
/* -------------------------------------------------------------------------- */

export type ModalityId = 'jiu-jitsu' | 'mma' | 'kids';

export interface Modality {
  readonly id: ModalityId;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly highlights: readonly string[];
  /** Slot de foto real. Troque pelo arquivo em /public quando tiver a imagem. */
  readonly imageSlot: string;
  readonly imageAlt: string;
}

export const modalities: readonly Modality[] = [
  {
    id: 'jiu-jitsu',
    name: 'Jiu-Jitsu',
    tagline: 'De segunda a sexta, do primeiro dia à faixa preta',
    description:
      'Base sólida de quedas, passagem de guarda e finalizações. A turma principal treina todos os dias úteis às 20h30, e quem chega sem nenhuma experiência começa pelo fundamento, no próprio ritmo, com correção direta do professor.',
    highlights: ['Segunda a sexta, 20h30', 'Turma feminina terça e quinta', 'Graduação acompanhada'],
    imageSlot: '/images/modalidade-jiu-jitsu.jpg',
    imageAlt: 'Treino de Jiu-Jitsu com kimono no tatame da Sabino Academia',
  },
  {
    id: 'mma',
    name: 'MMA',
    tagline: 'Trocação, clinch e solo em um treino só',
    description:
      'Boxe, muay thai, wrestling e solo integrados, três vezes por semana. Serve tanto para quem quer condicionamento pesado quanto para quem pensa em competir — a intensidade é ajustada por aluno.',
    highlights: ['Segunda, quarta e sexta, 19h30', 'Preparação física inclusa', 'Sem kimono'],
    imageSlot: '/images/modalidade-mma.jpg',
    imageAlt: 'Treino de MMA com luvas e foco em trocação na Sabino Academia',
  },
  {
    id: 'kids',
    name: 'Kids e Infantil',
    tagline: 'A partir dos 4 anos, com turma separada por idade',
    description:
      'Duas turmas distintas, porque criança de 5 anos e adolescente de 14 não treinam igual. A Kids (4 a 8 anos) trabalha coordenação, disciplina e convivência através da brincadeira dirigida. A Infantil (9 a 16 anos) aprofunda a técnica, a defesa pessoal e a progressão por graus e tarjas.',
    highlights: ['Kids 4 a 8: segunda e quinta', 'Infantil 9 a 16: terça e sexta', '12 graus com tarjas'],
    imageSlot: '/images/modalidade-kids.jpg',
    imageAlt: 'Crianças em aula de Jiu-Jitsu infantil na Sabino Academia',
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Planos (EXEMPLO)                                                           */
/* -------------------------------------------------------------------------- */

export interface Plan {
  readonly id: string;
  readonly name: string;
  readonly priceLabel: string;
  readonly periodLabel: string;
  readonly summary: string;
  readonly features: readonly string[];
  readonly highlighted: boolean;
  /** `true` enquanto os valores forem placeholders do seed. */
  readonly isExample: boolean;
}

export const plans: readonly Plan[] = [
  {
    id: 'mensal',
    name: 'Mensal',
    priceLabel: 'R$ 000',
    periodLabel: '/mês',
    summary: 'Sem fidelidade. Bom para quem está começando e quer testar a rotina.',
    features: [
      'Acesso a uma modalidade',
      'Horários livres dentro da grade',
      'Avaliação inicial com o professor',
    ],
    highlighted: false,
    isExample: true,
  },
  {
    id: 'trimestral',
    name: 'Trimestral',
    priceLabel: 'R$ 000',
    periodLabel: '/mês',
    summary: 'O plano que a maioria escolhe: três meses é tempo suficiente para criar constância.',
    features: [
      'Jiu-Jitsu + MMA liberados',
      'Horários livres dentro da grade',
      'Acompanhamento de graduação',
      'Acesso ao app do aluno',
    ],
    highlighted: true,
    isExample: true,
  },
  {
    id: 'anual',
    name: 'Anual',
    priceLabel: 'R$ 000',
    periodLabel: '/mês',
    summary: 'Melhor valor por mês para quem já decidiu que o treino faz parte da rotina.',
    features: [
      'Todas as modalidades',
      'Horários livres dentro da grade',
      'Acompanhamento de graduação',
      'Prioridade em seminários e eventos',
    ],
    highlighted: false,
    isExample: true,
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Grade de horários (REAL — fallback de schedule:classes)                     */
/* -------------------------------------------------------------------------- */

/** 0 = domingo ... 6 = sábado (mesma convenção de `Date.getDay`). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const weekdayLabels: Readonly<Record<Weekday, string>> = {
  0: 'Domingo',
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
};

export const weekdayShortLabels: Readonly<Record<Weekday, string>> = {
  0: 'Dom',
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
};

export interface ClassSlot {
  readonly id: string;
  readonly weekday: Weekday;
  /** `HH:mm`, fuso America/Sao_Paulo. */
  readonly startTime: string;
  readonly endTime: string;
  readonly title: string;
  readonly modality: ModalityId;
  readonly level: string;
  /** Unidade onde a aula acontece. */
  readonly unit: UnitId;
}

export interface Schedule {
  readonly classes: readonly ClassSlot[];
  /** `true` quando a grade veio do seed e não do Redis. */
  readonly isExample: boolean;
  readonly updatedAt: string | null;
}

/**
 * Grade confirmada pela academia:
 *   Kids (4 a 8 anos)      — segunda e quinta,   18h30 às 19h30
 *   Infantil (9 a 16 anos) — terça e sexta,      18h30 às 19h30
 *   MMA                    — segunda, quarta e sexta, 19h30 às 20h30
 *   Jiu-Jitsu feminino     — terça e quinta,     19h30 às 20h30
 *   Jiu-Jitsu              — segunda a sexta,    20h30 às 21h30
 */
const realClasses: readonly ClassSlot[] = [
  // Segunda
  { id: 'seg-1830-kids', weekday: 1, startTime: '18:30', endTime: '19:30', title: 'Jiu-Jitsu Kids', modality: 'kids', level: '4 a 8 anos', unit: 'tres-cachoeiras' },
  { id: 'seg-1930-mma', weekday: 1, startTime: '19:30', endTime: '20:30', title: 'MMA', modality: 'mma', level: 'Todos os níveis', unit: 'tres-cachoeiras' },
  { id: 'seg-2030-jj', weekday: 1, startTime: '20:30', endTime: '21:30', title: 'Jiu-Jitsu', modality: 'jiu-jitsu', level: 'Todos os níveis', unit: 'tres-cachoeiras' },

  // Terça
  { id: 'ter-1830-infantil', weekday: 2, startTime: '18:30', endTime: '19:30', title: 'Jiu-Jitsu Infantil', modality: 'kids', level: '9 a 16 anos', unit: 'tres-cachoeiras' },
  { id: 'ter-1930-jj-fem', weekday: 2, startTime: '19:30', endTime: '20:30', title: 'Jiu-Jitsu', modality: 'jiu-jitsu', level: 'Turma feminina', unit: 'tres-cachoeiras' },
  { id: 'ter-2030-jj', weekday: 2, startTime: '20:30', endTime: '21:30', title: 'Jiu-Jitsu', modality: 'jiu-jitsu', level: 'Todos os níveis', unit: 'tres-cachoeiras' },

  // Quarta
  { id: 'qua-1930-mma', weekday: 3, startTime: '19:30', endTime: '20:30', title: 'MMA', modality: 'mma', level: 'Todos os níveis', unit: 'tres-cachoeiras' },
  { id: 'qua-2030-jj', weekday: 3, startTime: '20:30', endTime: '21:30', title: 'Jiu-Jitsu', modality: 'jiu-jitsu', level: 'Todos os níveis', unit: 'tres-cachoeiras' },

  // Quinta
  { id: 'qui-1830-kids', weekday: 4, startTime: '18:30', endTime: '19:30', title: 'Jiu-Jitsu Kids', modality: 'kids', level: '4 a 8 anos', unit: 'tres-cachoeiras' },
  { id: 'qui-1930-jj-fem', weekday: 4, startTime: '19:30', endTime: '20:30', title: 'Jiu-Jitsu', modality: 'jiu-jitsu', level: 'Turma feminina', unit: 'tres-cachoeiras' },
  { id: 'qui-2030-jj', weekday: 4, startTime: '20:30', endTime: '21:30', title: 'Jiu-Jitsu', modality: 'jiu-jitsu', level: 'Todos os níveis', unit: 'tres-cachoeiras' },

  // Sexta
  { id: 'sex-1830-infantil', weekday: 5, startTime: '18:30', endTime: '19:30', title: 'Jiu-Jitsu Infantil', modality: 'kids', level: '9 a 16 anos', unit: 'tres-cachoeiras' },
  { id: 'sex-1930-mma', weekday: 5, startTime: '19:30', endTime: '20:30', title: 'MMA', modality: 'mma', level: 'Todos os níveis', unit: 'tres-cachoeiras' },
  { id: 'sex-2030-jj', weekday: 5, startTime: '20:30', endTime: '21:30', title: 'Jiu-Jitsu', modality: 'jiu-jitsu', level: 'Todos os níveis', unit: 'tres-cachoeiras' },
] as const;

export const seedSchedule: Schedule = {
  classes: realClasses,
  isExample: false,
  updatedAt: null,
};

/* -------------------------------------------------------------------------- */
/* Benefícios                                                                 */
/* -------------------------------------------------------------------------- */

export interface Benefit {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

export const benefits: readonly Benefit[] = [
  {
    id: 'acompanhamento',
    title: 'Professor no tatame, não na sala',
    description:
      'Turmas com tamanho controlado para que cada aluno receba correção individual na mesma aula.',
  },
  {
    id: 'iniciantes',
    title: 'Começar do zero é normal',
    description:
      'A maior parte de quem entra nunca lutou. A primeira semana é só entender a base, sem sparring.',
  },
  {
    id: 'turma-feminina',
    title: 'Turma feminina própria',
    description:
      'Jiu-Jitsu feminino às terças e quintas, 19h30: mesmo conteúdo técnico, em um ambiente para começar com confiança.',
  },
  {
    id: 'infantil',
    title: 'Criança treina com criança da idade dela',
    description:
      'Kids de 4 a 8 anos e Infantil de 9 a 16 em turmas separadas, cada uma com linguagem e exigência próprias.',
  },
  {
    id: 'graduacao',
    title: 'Graduação com critério',
    description:
      'Grau e faixa saem por tempo de treino, frequência e evolução técnica — tudo registrado no app.',
  },
  {
    id: 'app',
    title: 'Seu progresso no celular',
    description:
      'Check-in por QR Code, histórico de treinos, ranking da academia e status da mensalidade.',
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Depoimentos (EXEMPLO) - FORA DO AR                                         */
/* -------------------------------------------------------------------------- */
/*
 * A secao de depoimentos saiu da landing: nao ha relatos reais ainda, e
 * publicar exemplo como se fosse avaliacao de aluno engana quem visita.
 * Os dados ficam aqui para quando houver depoimento com autorizacao de uso de
 * nome e imagem - ai basta recriar o componente e inseri-lo em app/page.tsx.
 */

export interface Testimonial {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly quote: string;
  /** Slot de foto real; vazio usa as iniciais. */
  readonly avatarSlot: string | null;
  readonly isExample: true;
}

export const testimonials: readonly Testimonial[] = [
  {
    id: 't1',
    name: 'Nome do aluno',
    role: 'Faixa azul — exemplo',
    quote:
      'Depoimento de exemplo. Substitua por um relato real de aluno, com autorização de uso de imagem e nome.',
    avatarSlot: null,
    isExample: true,
  },
  {
    id: 't2',
    name: 'Nome da aluna',
    role: 'Turma feminina — exemplo',
    quote:
      'Depoimento de exemplo. Substitua por um relato real de aluna, com autorização de uso de imagem e nome.',
    avatarSlot: null,
    isExample: true,
  },
  {
    id: 't3',
    name: 'Nome do responsável',
    role: 'Mãe de aluno da turma Kids — exemplo',
    quote:
      'Depoimento de exemplo. Substitua por um relato real de responsável, com autorização de uso de imagem e nome.',
    avatarSlot: null,
    isExample: true,
  },
] as const;

/* -------------------------------------------------------------------------- */
/* FAQ                                                                        */
/* -------------------------------------------------------------------------- */

export interface FaqItem {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
  /** `true` enquanto a resposta ainda precisar ser confirmada pela academia. */
  readonly isExample: boolean;
}

export const faq: readonly FaqItem[] = [
  {
    id: 'experiencia',
    question: 'Preciso ter alguma experiência para começar?',
    answer:
      'Não. As turmas têm divisão por nível e a primeira semana é dedicada à base: postura, quedas e movimentação no solo. Ninguém entra em sparring no primeiro dia.',
    isExample: false,
  },
  {
    id: 'idade-kids',
    question: 'A partir de que idade a criança pode treinar?',
    answer:
      'A partir dos 4 anos. A turma Kids (4 a 8 anos) treina segunda e quinta, às 18h30, com foco no desenvolvimento motor, na disciplina e na convivência. A turma Infantil (9 a 16 anos) treina terça e sexta, no mesmo horário, com mais técnica e defesa pessoal.',
    isExample: false,
  },
  {
    id: 'turma-feminina',
    question: 'Existe turma só para mulheres?',
    answer:
      'Sim. O Jiu-Jitsu feminino acontece às terças e quintas, das 19h30 às 20h30. É a mesma técnica da turma mista, em um ambiente pensado para quem prefere começar assim. Quem quiser, também pode treinar nas turmas das 20h30.',
    isExample: false,
  },
  {
    id: 'equipamento',
    question: 'O que eu levo na primeira aula?',
    answer:
      'Roupa confortável, garrafa de água e chinelo para circular fora do tatame. O kimono só é necessário depois que você decidir seguir no Jiu-Jitsu.',
    isExample: false,
  },
  {
    id: 'atendimento',
    question: 'Como falo com a academia?',
    answer:
      'Pelo WhatsApp em horário comercial, ou pessoalmente na recepção durante os horários de treino, de segunda a sexta, das 18h30 às 21h30.',
    isExample: false,
  },
  {
    id: 'experimental',
    question: 'A aula experimental é gratuita?',
    answer:
      'São duas aulas experimentais gratuitas, sem compromisso. Agende pelo WhatsApp informando a modalidade e o horário que prefere, e leve só roupa confortável e uma garrafa de água.',
    isExample: false,
  },
  {
    id: 'cancelamento',
    question: 'Como funciona o cancelamento do plano?',
    answer:
      'Resposta de exemplo — descrever as regras reais de cancelamento, carência e trancamento de cada plano.',
    isExample: true,
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Números da academia (EXEMPLO)                                              */
/* -------------------------------------------------------------------------- */

export interface StatItem {
  readonly id: string;
  readonly value: string;
  readonly label: string;
  readonly isExample: boolean;
}

export const stats: readonly StatItem[] = [
  { id: 'modalidades', value: '4', label: 'turmas diferentes na semana', isExample: false },
  { id: 'idade', value: '4+', label: 'anos, idade mínima para treinar', isExample: false },
  { id: 'dias', value: '5', label: 'dias de treino por semana', isExample: false },
] as const;
