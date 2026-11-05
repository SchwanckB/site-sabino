import type { DocumentKind } from '@/lib/documentRules';
import type { AdultBelt } from '@/utils/graduationEngine';
import type { PlanId } from '@/utils/paymentEngine';

/** Situação do cadastro. O aluno só entra no app quando está `ativo`. */
export type UserStatus = 'pendente' | 'ativo' | 'recusado' | 'inativo';

export const USER_STATUSES: readonly UserStatus[] = [
  'pendente',
  'ativo',
  'recusado',
  'inativo',
];

export const STATUS_LABELS: Readonly<Record<UserStatus, string>> = {
  pendente: 'Aguardando aprovação',
  ativo: 'Ativo',
  recusado: 'Recusado',
  inativo: 'Inativo',
};

/**
 * Sexo do aluno. Usado nos filtros do painel e na turma feminina.
 * Opcional de propósito: ninguém fica barrado na matrícula por não informar.
 */
export type Gender = 'masculino' | 'feminino' | 'nao_informado';

export const GENDERS: readonly Gender[] = ['masculino', 'feminino', 'nao_informado'];

export const GENDER_LABELS: Readonly<Record<Gender, string>> = {
  masculino: 'Masculino',
  feminino: 'Feminino',
  nao_informado: 'Não informado',
};

/** Trilha de graduação. Derivada da idade, revista no aniversário de 16 anos. */
export type Category = 'kids' | 'adulto';

/**
 * Faixas da trilha infantil, na ordem da progressão.
 *
 * Cinza, amarela, laranja e verde têm três variações cada — com branco, lisa
 * e com preto — que é como a graduação infantil funciona de fato. São treze
 * degraus entre a branca e a saída para a faixa adulta, e não cinco.
 *
 * O valor gravado é o id (`cinza-branca`); o rótulo é só apresentação. As
 * fichas antigas já usam `cinza`, `amarela`, `laranja` e `verde`, que
 * continuam valendo como a variação lisa — nenhuma migração é necessária.
 */
export const KIDS_BELTS = [
  'branca',
  'cinza-branca',
  'cinza',
  'cinza-preta',
  'amarela-branca',
  'amarela',
  'amarela-preta',
  'laranja-branca',
  'laranja',
  'laranja-preta',
  'verde-branca',
  'verde',
  'verde-preta',
] as const;

export type KidsBelt = (typeof KIDS_BELTS)[number];

export const KIDS_BELT_LABELS: Readonly<Record<KidsBelt, string>> = {
  branca: 'Branca',
  'cinza-branca': 'Cinza e branca',
  cinza: 'Cinza',
  'cinza-preta': 'Cinza e preta',
  'amarela-branca': 'Amarela e branca',
  amarela: 'Amarela',
  'amarela-preta': 'Amarela e preta',
  'laranja-branca': 'Laranja e branca',
  laranja: 'Laranja',
  'laranja-preta': 'Laranja e preta',
  'verde-branca': 'Verde e branca',
  verde: 'Verde',
  'verde-preta': 'Verde e preta',
};

/** Rótulo de qualquer faixa, infantil ou adulta. */
export function beltLabel(belt: string): string {
  const kids = KIDS_BELT_LABELS[belt as KidsBelt];
  if (kids) return kids;
  return belt.charAt(0).toUpperCase() + belt.slice(1);
}

export const ADULT_BELTS: readonly AdultBelt[] = [
  'branca',
  'azul',
  'roxa',
  'marrom',
  'preta',
];

/**
 * Toda faixa válida, infantil ou adulta.
 *
 * As duas trilhas compartilham a branca, por isso o `Set` em vez de concatenar
 * as listas. Existe porque as ações de admin gravavam a faixa conferindo só
 * `length > 0`: um valor digitado errado — ou um `<select>` adulterado no
 * navegador — entrava no banco e aparecia na ficha do aluno como se fosse uma
 * graduação real. Status, sexo e forma de pagamento já eram validados contra as
 * suas listas; a faixa tinha escapado.
 */
const ALL_BELTS: ReadonlySet<string> = new Set<string>([...KIDS_BELTS, ...ADULT_BELTS]);

/** `true` se a faixa existe em uma das duas trilhas. */
export function isBelt(value: string): boolean {
  return ALL_BELTS.has(value);
}

/** Lista ordenada das faixas aceitas — para mensagem de erro e testes. */
export const BELT_IDS: readonly string[] = [...ALL_BELTS];

/** Idade a partir da qual o aluno sai da trilha infantil. */
export const ADULT_AGE = 16;

/**
 * Idade abaixo da qual o cadastro exige responsável.
 *
 * Fonte única: `utils/onboardingValidation.ts` reexporta daqui em vez de
 * declarar o próprio. Eram duas constantes com o mesmo valor, uma usada pelo
 * cliente para **mostrar** os campos do responsável e outra usada pelo servidor
 * para **exigir** — o dia em que divergissem, o formulário esconderia um campo
 * que o servidor cobra, e o aluno veria um erro impossível de corrigir.
 */
export const GUARDIAN_REQUIRED_AGE = 18;

/** Versão da política de privacidade aceita no cadastro. */
export const CONSENT_VERSION = 'lgpd-2026-01';

/**
 * Unidade da academia.
 *
 * A rede tem duas escolas com alunos, grade e financeiro próprios. Tudo que
 * é por aluno ou por turma carrega a unidade; o painel filtra por ela. Quem
 * foi cadastrado antes da segunda unidade existir cai em Três Cachoeiras,
 * que era a única — por isso o valor padrão, e não um campo vazio.
 */
export type UnitId = 'tres-cachoeiras' | 'terra-de-areia';

export const UNITS: readonly UnitId[] = ['tres-cachoeiras', 'terra-de-areia'];

export const UNIT_LABELS: Readonly<Record<UnitId, string>> = {
  'tres-cachoeiras': 'Três Cachoeiras',
  'terra-de-areia': 'Terra de Areia',
};

/** Rótulo curto, para caber em filtro e crachá de lista. */
export const UNIT_SHORT: Readonly<Record<UnitId, string>> = {
  'tres-cachoeiras': 'T. Cachoeiras',
  'terra-de-areia': 'Terra de Areia',
};

export const DEFAULT_UNIT: UnitId = 'tres-cachoeiras';

export function isUnitId(value: unknown): value is UnitId {
  return typeof value === 'string' && (UNITS as readonly string[]).includes(value);
}

/** Unidade vinda do banco ou de formulário, com queda para a padrão. */
export function toUnitId(value: unknown): UnitId {
  return isUnitId(value) ? value : DEFAULT_UNIT;
}

/**
 * Ficha do aluno. **Contém dado pessoal** (CPF, documento) e nunca pode ser
 * serializada inteira para o cliente — use {@link PublicStudent}.
 */
export interface StudentRecord {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  /** Somente dígitos. Validado com DV no cadastro. */
  readonly cpf: string;
  /** `YYYY-MM-DD`, data civil. */
  readonly birthDate: string;
  readonly status: UserStatus;
  readonly category: Category;
  readonly gender: Gender;
  readonly unit: UnitId;
  readonly belt: string;
  readonly degree: number;
  /**
   * Entra na previsão automática de graus da trilha infantil.
   *
   * Nem toda criança gradua de mês em mês: há quem treine só uma vez por
   * semana, quem esteja voltando de lesão, quem o professor decidiu segurar.
   * Com `false` o aluno continua na turma e na chamada, mas some da agenda
   * de graduação — o professor gradua na mão quando entender que é hora.
   */
  readonly graduatesMonthly: boolean;
  readonly guardianName: string | null;
  readonly guardianPhone: string | null;
  readonly guardianCpf: string | null;
  /** ISO UTC da aprovação — âncora de graduação e de matrícula. */
  readonly joinedAt: string | null;
  readonly lastGraduationAt: string | null;
  /** Caminho no Vercel Blob privado. **Nunca** uma URL pública. */
  readonly docBlobKey: string | null;
  /**
   * O que foi anexado: documento de identidade ou foto do rosto.
   *
   * As duas valem para a matrícula, mas não se equivalem — o professor precisa
   * saber o que tem em mãos ao aprovar. Fichas anteriores ao campo são lidas
   * como `documento`, que era a única opção quando foram criadas.
   */
  readonly docKind: DocumentKind;
  readonly consentVersion: string;
  readonly consentAt: string;
  /** Turmas atribuídas pelo admin na aprovação. */
  readonly classIds: readonly string[];
  readonly rejectionReason: string | null;
  readonly notes: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Projeção segura para o cliente: sem CPF completo, sem chave de documento.
 * É esta forma que atravessa a fronteira servidor → navegador.
 */
export interface PublicStudent {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  /** Apenas os dois últimos dígitos: `•••.•••.•••-25`. */
  readonly cpfMasked: string;
  readonly birthDate: string;
  readonly age: number;
  readonly status: UserStatus;
  readonly category: Category;
  readonly gender: Gender;
  readonly unit: UnitId;
  readonly belt: string;
  readonly degree: number;
  readonly graduatesMonthly: boolean;
  readonly guardianName: string | null;
  readonly guardianPhone: string | null;
  readonly joinedAt: string | null;
  readonly lastGraduationAt: string | null;
  readonly hasDocument: boolean;
  /** O que foi anexado: documento de identidade ou foto do rosto. */
  readonly docKind: DocumentKind;
  readonly classIds: readonly string[];
  readonly rejectionReason: string | null;
  readonly notes: string;
  readonly createdAt: string;
}

/** Entrada do histórico de graduações. */
export interface GraduationEntry {
  readonly at: string;
  readonly fromBelt: string;
  readonly fromDegree: number;
  readonly toBelt: string;
  readonly toDegree: number;
  readonly stripeColor: string | null;
  readonly registeredBy: string;
  readonly note: string;
}

/** Entrada do histórico de pagamentos. */
export interface PaymentEntry {
  readonly paidAt: string;
  /** `YYYY-MM` da parcela quitada. */
  readonly referenceMonth: string;
  /** Valor recebido — não necessariamente o da parcela, desde o parcial. */
  readonly amountCents: number;
  readonly method: string;
  readonly registeredBy: string;
  /** Novo vencimento depois deste pagamento. */
  readonly coveredUntil: string;
  /**
   * Vencimento da parcela que este pagamento quitou.
   *
   * É o que torna o atraso um dado em vez de uma estimativa: sem ele, só dava
   * para inferir o vencimento a partir de `coveredUntil` menos o período, e a
   * conta errava em quem mudou de plano. Vazio nos pagamentos gravados antes
   * do campo — a análise de inadimplência ignora esses em vez de contá-los
   * como pontuais.
   */
  readonly dueDate: string;
  /**
   * Quantas parcelas o valor recebido fechou.
   *
   * `0` em pagamento parcial — o dinheiro entrou e nada venceu. Mais de uma
   * em pagamento adiantado. `1` nos registros antigos, que era o único caso
   * possível quando a baixa era tudo ou nada.
   */
  readonly installments: number;
  /** Crédito que havia **antes** deste pagamento. É o que o desfazer repõe. */
  readonly creditBeforeCents: number;
  /** Número sequencial do recibo. `0` nos pagamentos anteriores ao recibo. */
  readonly receiptNumber: number;
}

/** Uma mudança no valor combinado da mensalidade. */
export interface PlanChangeEntry {
  readonly at: string;
  readonly fromCents: number;
  readonly toCents: number;
  readonly fromDiscountCents: number;
  readonly toDiscountCents: number;
  readonly registeredBy: string;
  readonly note: string;
}

export const PAYMENT_METHODS = ['pix', 'dinheiro', 'cartao', 'transferencia', 'outro'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  transferencia: 'Transferência',
  outro: 'Outro',
};

/** Como a presença foi registrada — aparece no histórico e na auditoria. */
export type CheckinSource = 'qr' | 'manual' | 'lote';

export const CHECKIN_SOURCE_LABELS: Readonly<Record<CheckinSource, string>> = {
  qr: 'QR Code',
  manual: 'Manual',
  lote: 'Manual em lote',
};

export interface CheckinEntry {
  readonly at: string;
  /** `YYYY-MM-DD` do dia civil em São Paulo. */
  readonly date: string;
  readonly classId: string | null;
  readonly classTitle: string | null;
  readonly source: CheckinSource;
  /** Quem registrou: o próprio aluno (QR) ou o admin. */
  readonly registeredBy: string;
}

export interface PaymentPlanRecord {
  readonly userId: string;
  readonly planId: PlanId;
  /**
   * Nome do plano contratado, escolhido entre os da vitrine na aprovação.
   *
   * É rótulo, não regra: a cobrança continua saindo de `planId` (período) e
   * `amountCents` (valor). Vazio nas mensalidades gravadas antes do campo
   * existir, e vazio também quando a academia define um valor avulso sem plano
   * correspondente.
   */
  readonly planName: string;
  /** Valor de tabela, antes do desconto. */
  readonly amountCents: number;
  /** Desconto fixo por parcela: bolsa, irmão, combinado. */
  readonly discountCents: number;
  readonly discountReason: string;
  /** Pagamento parcial que ainda não fechou parcela. */
  readonly creditCents: number;
  readonly dueDay: number;
  readonly graceDays: number;
  readonly dueDate: string;
  readonly lastPaidAt: string | null;
}

/** Resultado de uma tentativa de check-in. */
export type CheckinResult =
  | {
      readonly ok: true;
      /** Título da aula, ou os títulos juntos quando foi mais de uma. */
      readonly classTitle: string | null;
      readonly at: string;
      /**
       * Cada aula registrada nesta leitura do QR.
       *
       * É uma lista porque o aluno que faz MMA às 19:30 e fica para o Jiu das
       * 20:30 marca as duas de uma vez, respondendo "sim" na pergunta do
       * check-in. A tela de sucesso precisa confirmar as duas pelo nome — um
       * "presença registrada" genérico deixaria dúvida sobre a segunda.
       */
      readonly classes: readonly { readonly title: string; readonly time: string }[];
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'ja_registrado'
        | 'sem_aula_agora'
        | 'aluno_inativo'
        | 'qr_invalido'
        | 'qr_expirado'
        | 'erro';
      readonly message: string;
    };

/**
 * Recorte de unidade usado no painel.
 *
 * `'todas'` existe porque o professor precisa das duas visões: operar uma
 * academia por vez e, de vez em quando, olhar a rede inteira.
 */
export type UnitScope = UnitId | 'todas';

export function isUnitScope(value: unknown): value is UnitScope {
  return value === 'todas' || isUnitId(value);
}

export function toUnitScope(value: unknown): UnitScope {
  return isUnitScope(value) ? value : 'todas';
}

/** `true` se a unidade entra no recorte. Pura, para filtrar listas. */
export function matchesUnit(scope: UnitScope, unit: UnitId): boolean {
  return scope === 'todas' || scope === unit;
}

export const UNIT_SCOPE_LABELS: Readonly<Record<UnitScope, string>> = {
  todas: 'Todas as academias',
  'tres-cachoeiras': 'Três Cachoeiras',
  'terra-de-areia': 'Terra de Areia',
};

/** Filtra qualquer lista que carregue unidade. Pura, usada nas telas do admin. */
export function filterByUnit<T extends { readonly unit: UnitId }>(
  items: readonly T[],
  scope: UnitScope,
): T[] {
  return scope === 'todas' ? [...items] : items.filter((item) => item.unit === scope);
}
