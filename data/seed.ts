/**
 * ===========================================================================
 * DADOS DE EXEMPLO - SUBSTITUIR ANTES DE PUBLICAR
 * ===========================================================================
 *
 * Precos, horarios, depoimentos e textos de FAQ abaixo sao PLACEHOLDERS.
 * Nada aqui foi confirmado com a academia. Cada bloco carrega a flag
 * `isExample` para que a interface possa sinalizar visualmente o que ainda
 * precisa ser revisado (ver o aviso no topo das secoes Planos e Horarios).
 *
 * Ao conectar o Upstash Redis, a grade real passa a vir de `schedule:classes`
 * e este arquivo continua servindo apenas como fallback. Ver lib/schedule.ts.
 * ===========================================================================
 */

export const EXAMPLE_DATA_NOTICE =
  'Conteudo de demonstracao: valores e horarios ainda nao confirmados pela academia.';

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
    tagline: 'Com kimono, do primeiro dia a faixa preta',
    description:
      'Base solida de quedas, passagem de guarda e finalizacoes. As turmas sao divididas por nivel, entao quem chega sem nenhuma experiencia treina no proprio ritmo, com acompanhamento direto do professor.',
    highlights: ['Turmas iniciante e avancada', 'Graduacao acompanhada', 'Treino com kimono'],
    imageSlot: '/images/modalidade-jiu-jitsu.jpg',
    imageAlt: 'Treino de Jiu-Jitsu com kimono no tatame da Sabino Academia',
  },
  {
    id: 'mma',
    name: 'MMA',
    tagline: 'Trocacao, clinch e solo em um treino so',
    description:
      'Boxe, muay thai, wrestling e solo integrados. Serve tanto para quem quer condicionamento pesado quanto para quem pensa em competir - a intensidade e ajustada por aluno.',
    highlights: ['Preparacao fisica inclusa', 'Sparring supervisionado', 'Sem kimono'],
    imageSlot: '/images/modalidade-mma.jpg',
    imageAlt: 'Treino de MMA com luvas e foco em trocacao na Sabino Academia',
  },
  {
    id: 'kids',
    name: 'Jiu-Jitsu Kids',
    tagline: 'Disciplina e defesa pessoal para criancas',
    description:
      'Aulas pensadas para a faixa de 4 a 15 anos, com progressao por graus e tarjas. Trabalha coordenacao, respeito e defesa pessoal sem estimular agressividade.',
    highlights: ['12 graus com tarjas', 'Relatorio de evolucao', 'Turmas por faixa etaria'],
    imageSlot: '/images/modalidade-kids.jpg',
    imageAlt: 'Criancas em aula de Jiu-Jitsu Kids na Sabino Academia',
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
  readonly isExample: true;
}

export const plans: readonly Plan[] = [
  {
    id: 'mensal',
    name: 'Mensal',
    priceLabel: 'R$ 000',
    periodLabel: '/mes',
    summary: 'Sem fidelidade. Bom para quem esta comecando e quer testar a rotina.',
    features: [
      'Acesso a uma modalidade',
      'Horarios livres dentro da grade',
      'Avaliacao inicial com o professor',
    ],
    highlighted: false,
    isExample: true,
  },
  {
    id: 'trimestral',
    name: 'Trimestral',
    priceLabel: 'R$ 000',
    periodLabel: '/mes',
    summary: 'O plano que a maioria escolhe: tres meses e tempo suficiente para criar constancia.',
    features: [
      'Jiu-Jitsu + MMA liberados',
      'Horarios livres dentro da grade',
      'Acompanhamento de graduacao',
      'Acesso ao app do aluno',
    ],
    highlighted: true,
    isExample: true,
  },
  {
    id: 'anual',
    name: 'Anual',
    priceLabel: 'R$ 000',
    periodLabel: '/mes',
    summary: 'Melhor valor por mes para quem ja decidiu que o treino faz parte da rotina.',
    features: [
      'Todas as modalidades',
      'Horarios livres dentro da grade',
      'Acompanhamento de graduacao',
      'Prioridade em seminarios e eventos',
    ],
    highlighted: false,
    isExample: true,
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Grade de horarios (EXEMPLO - fallback de schedule:classes)                  */
/* -------------------------------------------------------------------------- */

/** 0 = domingo ... 6 = sabado (mesma convencao de `Date.getDay`). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const weekdayLabels: Readonly<Record<Weekday, string>> = {
  0: 'Domingo',
  1: 'Segunda',
  2: 'Terca',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sabado',
};

export const weekdayShortLabels: Readonly<Record<Weekday, string>> = {
  0: 'Dom',
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sab',
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
}

export interface Schedule {
  readonly classes: readonly ClassSlot[];
  /** `true` quando a grade veio do seed e nao do Redis. */
  readonly isExample: boolean;
  readonly updatedAt: string | null;
}

const exampleClasses: readonly ClassSlot[] = [
  { id: 'seg-0700-jj', weekday: 1, startTime: '07:00', endTime: '08:00', title: 'Jiu-Jitsu', modality: 'jiu-jitsu', level: 'Todos os niveis' },
  { id: 'seg-1800-kids', weekday: 1, startTime: '18:00', endTime: '19:00', title: 'Jiu-Jitsu Kids', modality: 'kids', level: '4 a 15 anos' },
  { id: 'seg-1930-jj', weekday: 1, startTime: '19:30', endTime: '21:00', title: 'Jiu-Jitsu', modality: 'jiu-jitsu', level: 'Iniciante' },

  { id: 'ter-0700-mma', weekday: 2, startTime: '07:00', endTime: '08:00', title: 'MMA', modality: 'mma', level: 'Todos os niveis' },
  { id: 'ter-1900-mma', weekday: 2, startTime: '19:00', endTime: '20:30', title: 'MMA', modality: 'mma', level: 'Todos os niveis' },

  { id: 'qua-0700-jj', weekday: 3, startTime: '07:00', endTime: '08:00', title: 'Jiu-Jitsu', modality: 'jiu-jitsu', level: 'Todos os niveis' },
  { id: 'qua-1800-kids', weekday: 3, startTime: '18:00', endTime: '19:00', title: 'Jiu-Jitsu Kids', modality: 'kids', level: '4 a 15 anos' },
  { id: 'qua-1930-jj', weekday: 3, startTime: '19:30', endTime: '21:00', title: 'Jiu-Jitsu', modality: 'jiu-jitsu', level: 'Avancado' },

  { id: 'qui-0700-mma', weekday: 4, startTime: '07:00', endTime: '08:00', title: 'MMA', modality: 'mma', level: 'Todos os niveis' },
  { id: 'qui-1900-mma', weekday: 4, startTime: '19:00', endTime: '20:30', title: 'MMA', modality: 'mma', level: 'Todos os niveis' },

  { id: 'sex-1800-kids', weekday: 5, startTime: '18:00', endTime: '19:00', title: 'Jiu-Jitsu Kids', modality: 'kids', level: '4 a 15 anos' },
  { id: 'sex-1930-jj', weekday: 5, startTime: '19:30', endTime: '21:00', title: 'Jiu-Jitsu', modality: 'jiu-jitsu', level: 'Todos os niveis' },

  { id: 'sab-1000-open', weekday: 6, startTime: '10:00', endTime: '11:30', title: 'Treino livre', modality: 'jiu-jitsu', level: 'Open mat' },
] as const;

export const seedSchedule: Schedule = {
  classes: exampleClasses,
  isExample: true,
  updatedAt: null,
};

/* -------------------------------------------------------------------------- */
/* Beneficios                                                                 */
/* -------------------------------------------------------------------------- */

export interface Benefit {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

export const benefits: readonly Benefit[] = [
  {
    id: 'acompanhamento',
    title: 'Professor no tatame, nao na sala',
    description:
      'Turmas com tamanho controlado para que cada aluno receba correcao individual na mesma aula.',
  },
  {
    id: 'iniciantes',
    title: 'Comecar do zero e normal',
    description:
      'A maior parte de quem entra nunca lutou. A primeira semana e so entender a base, sem sparring.',
  },
  {
    id: 'graduacao',
    title: 'Graduacao com criterio',
    description:
      'Grau e faixa saem por tempo de treino, frequencia e evolucao tecnica - tudo registrado no app.',
  },
  {
    id: 'app',
    title: 'Seu progresso no celular',
    description:
      'Check-in por QR Code, historico de treinos, ranking da academia e status da mensalidade.',
  },
  {
    id: 'kids',
    title: 'Kids com progressao clara',
    description:
      'Doze graus com tarjas brancas, vermelhas e amarelas. Os pais acompanham cada etapa.',
  },
  {
    id: 'comunidade',
    title: 'Treino que cabe no verao de Torres',
    description:
      'Grade pensada para a rotina do litoral: cedo antes do trabalho ou no fim da tarde.',
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Depoimentos (EXEMPLO)                                                      */
/* -------------------------------------------------------------------------- */

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
    role: 'Faixa azul - exemplo',
    quote:
      'Depoimento de exemplo. Substitua por um relato real de aluno, com autorizacao de uso de imagem e nome.',
    avatarSlot: null,
    isExample: true,
  },
  {
    id: 't2',
    name: 'Nome da aluna',
    role: 'Turma de MMA - exemplo',
    quote:
      'Depoimento de exemplo. Substitua por um relato real de aluno, com autorizacao de uso de imagem e nome.',
    avatarSlot: null,
    isExample: true,
  },
  {
    id: 't3',
    name: 'Nome do responsavel',
    role: 'Mae de aluno Kids - exemplo',
    quote:
      'Depoimento de exemplo. Substitua por um relato real de responsavel, com autorizacao de uso de imagem e nome.',
    avatarSlot: null,
    isExample: true,
  },
] as const;

/* -------------------------------------------------------------------------- */
/* FAQ (EXEMPLO - revisar respostas com a academia)                           */
/* -------------------------------------------------------------------------- */

export interface FaqItem {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
  readonly isExample: true;
}

export const faq: readonly FaqItem[] = [
  {
    id: 'experiencia',
    question: 'Preciso ter alguma experiencia para comecar?',
    answer:
      'Nao. As turmas tem divisao por nivel e a primeira semana e dedicada a base: postura, quedas e movimentacao no solo. Ninguem entra em sparring no primeiro dia.',
    isExample: true,
  },
  {
    id: 'equipamento',
    question: 'O que eu levo na primeira aula?',
    answer:
      'Roupa confortavel, garrafa de agua e chinelo para circular fora do tatame. O kimono so e necessario depois que voce decidir seguir no Jiu-Jitsu.',
    isExample: true,
  },
  {
    id: 'experimental',
    question: 'A aula experimental e gratuita?',
    answer:
      'Resposta de exemplo - confirmar com a academia. Agende pelo WhatsApp informando a modalidade e o horario que prefere.',
    isExample: true,
  },
  {
    id: 'idade-kids',
    question: 'A partir de que idade a crianca pode treinar?',
    answer:
      'Resposta de exemplo - confirmar as faixas etarias das turmas Kids com a academia antes de publicar.',
    isExample: true,
  },
  {
    id: 'condicionamento',
    question: 'Preciso estar em forma antes de comecar?',
    answer:
      'Nao. O condicionamento vem do proprio treino. A intensidade e ajustada por aluno, e quem esta voltando de um periodo parado comeca mais leve.',
    isExample: true,
  },
  {
    id: 'cancelamento',
    question: 'Como funciona o cancelamento do plano?',
    answer:
      'Resposta de exemplo - descrever as regras reais de cancelamento, carencia e trancamento de cada plano.',
    isExample: true,
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Numeros da academia (EXEMPLO)                                              */
/* -------------------------------------------------------------------------- */

export interface StatItem {
  readonly id: string;
  readonly value: string;
  readonly label: string;
  readonly isExample: true;
}

export const stats: readonly StatItem[] = [
  { id: 'alunos', value: '000', label: 'alunos ativos', isExample: true },
  { id: 'anos', value: '00', label: 'anos de tatame', isExample: true },
  { id: 'turmas', value: '00', label: 'turmas por semana', isExample: true },
] as const;
