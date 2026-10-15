/**
 * Validação do pré-cadastro — função pura, sem I/O.
 *
 * Mora fora da Server Action de propósito: regra de negócio escondida dentro de
 * um handler não dá para testar, e foi exatamente aí que erros passaram
 * despercebidos. Aqui cada caso vira um teste.
 *
 * O cliente também pode usar as mesmas regras para dar retorno imediato, mas o
 * que vale é a execução no servidor.
 */

import { isValidCpf, onlyDigits } from './cpf';
import { calculateAge } from './graduationEngine';

/** Idade mínima e máxima aceitas na matrícula. */
export const MIN_AGE = 3;
export const MAX_AGE = 100;

/** Abaixo disso, o cadastro exige responsável. */
export const GUARDIAN_AGE = 18;

const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 13;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface OnboardingInput {
  readonly name: string;
  readonly phone: string;
  readonly cpf: string;
  readonly birthDate: string;
  readonly guardianName: string;
  readonly guardianPhone: string;
  readonly guardianCpf: string;
  /** Opcional — vazio vira 'nao_informado'. */
  readonly gender: string;
  readonly consent: boolean;
  /** Já existe documento enviado antes, ou um novo veio no formulário. */
  readonly hasDocument: boolean;
  /** `false` quando o armazenamento de arquivos não está configurado. */
  readonly documentRequired: boolean;
}

export interface OnboardingValidation {
  readonly valid: boolean;
  readonly fieldErrors: Readonly<Record<string, string>>;
  /** Dados normalizados, prontos para gravar. Só confiável quando `valid`. */
  readonly normalized: {
    readonly name: string;
    readonly phone: string;
    readonly cpf: string;
    readonly birthDate: string;
    readonly age: number;
    readonly isMinor: boolean;
    readonly guardianName: string | null;
    readonly guardianPhone: string | null;
    readonly guardianCpf: string | null;
    readonly gender: 'masculino' | 'feminino' | 'nao_informado';
  };
}

function validPhone(digits: string): boolean {
  return digits.length >= PHONE_MIN_DIGITS && digits.length <= PHONE_MAX_DIGITS;
}

/** Rejeita datas que casam com o formato mas não existem (31/02, mês 13). */
function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validateOnboarding(
  input: OnboardingInput,
  now: Date,
): OnboardingValidation {
  const fieldErrors: Record<string, string> = {};

  const name = input.name.trim();
  if (name.length < 3) {
    fieldErrors['name'] = 'Informe o nome completo.';
  }

  const phone = onlyDigits(input.phone);
  if (!validPhone(phone)) {
    fieldErrors['phone'] = 'Informe um telefone válido com DDD.';
  }

  const cpf = onlyDigits(input.cpf);
  if (!isValidCpf(cpf)) {
    fieldErrors['cpf'] = 'CPF inválido. Confira os números.';
  }

  const birthDate = input.birthDate.trim();
  let age = 0;

  if (!isRealDate(birthDate)) {
    fieldErrors['birthDate'] = 'Informe uma data de nascimento válida.';
  } else {
    age = calculateAge(birthDate, now);
    if (age < MIN_AGE || age > MAX_AGE) {
      fieldErrors['birthDate'] = `Idade fora do esperado (${MIN_AGE} a ${MAX_AGE} anos).`;
    }
  }

  const isMinor = age > 0 && age < GUARDIAN_AGE && fieldErrors['birthDate'] === undefined;

  const guardianName = input.guardianName.trim();
  const guardianPhone = onlyDigits(input.guardianPhone);
  const guardianCpf = onlyDigits(input.guardianCpf);

  if (isMinor) {
    if (guardianName.length < 3) {
      fieldErrors['guardianName'] = 'Informe o nome do responsável.';
    }
    if (!validPhone(guardianPhone)) {
      fieldErrors['guardianPhone'] = 'Informe o telefone do responsável.';
    }
    // CPF do responsável é opcional, mas se vier tem que ser válido.
    if (guardianCpf.length > 0 && !isValidCpf(guardianCpf)) {
      fieldErrors['guardianCpf'] = 'CPF do responsável inválido.';
    }
  }

  if (!input.consent) {
    fieldErrors['consent'] = 'É necessário aceitar o uso dos dados para a matrícula.';
  }

  if (input.documentRequired && !input.hasDocument) {
    fieldErrors['document'] = 'Envie uma foto ou PDF do documento.';
  }

  return {
    valid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
    normalized: {
      name,
      phone,
      cpf,
      birthDate,
      age,
      isMinor,
      guardianName: isMinor ? guardianName : null,
      guardianPhone: isMinor ? guardianPhone : null,
      guardianCpf: isMinor && guardianCpf.length > 0 ? guardianCpf : null,
      gender:
        input.gender === 'masculino' || input.gender === 'feminino'
          ? input.gender
          : 'nao_informado',
    },
  };
}
