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

/** Faixas infantis usadas pela academia. */
export const KIDS_BELTS = ['branca', 'cinza', 'amarela', 'laranja', 'verde'] as const;
export type KidsBelt = (typeof KIDS_BELTS)[number];

export const ADULT_BELTS: readonly AdultBelt[] = [
  'branca',
  'azul',
  'roxa',
  'marrom',
  'preta',
];

/** Idade a partir da qual o aluno sai da trilha infantil. */
export const ADULT_AGE = 16;

/** Idade abaixo da qual o cadastro exige responsável. */
export const GUARDIAN_REQUIRED_AGE = 18;

/** Versão da política de privacidade aceita no cadastro. */
export const CONSENT_VERSION = 'lgpd-2026-01';

/**
 * Ficha do aluno. **Contém dado pessoal** (CPF, documento) e nunca pode ser
 * serializada inteira para o cliente — use {@link PublicStudent}.
 */
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
  readonly guardianName: string | null;
  readonly guardianPhone: string | null;
  readonly guardianCpf: string | null;
  /** ISO UTC da aprovação — âncora de graduação e de matrícula. */
  readonly joinedAt: string | null;
  readonly lastGraduationAt: string | null;
  /** Caminho no Vercel Blob privado. **Nunca** uma URL pública. */
  readonly docBlobKey: string | null;
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
  readonly guardianName: string | null;
  readonly guardianPhone: string | null;
  readonly joinedAt: string | null;
  readonly lastGraduationAt: string | null;
  readonly hasDocument: boolean;
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
  readonly amountCents: number;
  readonly method: string;
  readonly registeredBy: string;
  /** Novo vencimento depois deste pagamento. */
  readonly coveredUntil: string;
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
  readonly amountCents: number;
  readonly dueDay: number;
  readonly graceDays: number;
  readonly dueDate: string;
  readonly lastPaidAt: string | null;
}

/** Resultado de uma tentativa de check-in. */
export type CheckinResult =
  | { readonly ok: true; readonly classTitle: string | null; readonly at: string }
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
