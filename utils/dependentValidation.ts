import { GUARDIAN_REQUIRED_AGE, UNITS, type Gender, type UnitId } from '@/types/domain';

import { isValidCpf, onlyDigits } from './cpf';
import { calculateAge } from './graduationEngine';
import { MAX_AGE, MIN_AGE } from './onboardingValidation';

/**
 * Cadastro de um familiar pendurado numa conta que já existe.
 *
 * É o irmão mais curto de `validateOnboarding`, e curto de propósito. Quem
 * preenche já está logado e já passou pela matrícula uma vez: o e-mail é o
 * da conta, o telefone e o CPF do responsável saem da ficha dele, e o
 * consentimento foi dado na própria.
 *
 * O que sobra é o que só ele sabe: nome, nascimento, sexo e academia.
 *
 * **CPF do dependente é opcional.** Criança de seis anos costuma ter um, mas
 * não na ponta da língua do pai no meio do tatame — e exigir aqui é trocar um
 * cadastro feito por um cadastro adiado. Quando vier, é validado com dígito
 * verificador como qualquer outro.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface DependentInput {
  readonly name: string;
  readonly birthDate: string;
  readonly cpf: string;
  readonly gender: string;
  readonly unit: string;
}

export interface DependentValidation {
  readonly valid: boolean;
  readonly fieldErrors: Readonly<Record<string, string>>;
  /** Normalizado e pronto para gravar. Só confiável quando `valid`. */
  readonly normalized: {
    readonly name: string;
    readonly birthDate: string;
    readonly cpf: string;
    readonly age: number;
    readonly isMinor: boolean;
    readonly gender: Gender;
    readonly unit: UnitId;
  };
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

export function validateDependent(
  input: DependentInput,
  now: Date,
): DependentValidation {
  const fieldErrors: Record<string, string> = {};

  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name.length < 3) {
    fieldErrors['name'] = 'Informe o nome completo.';
  }

  const birthDate = input.birthDate.trim();
  let age = 0;
  if (!isRealDate(birthDate)) {
    fieldErrors['birthDate'] = 'Informe uma data de nascimento válida.';
  } else {
    age = calculateAge(birthDate, now);
    if (age < MIN_AGE) {
      fieldErrors['birthDate'] = `A idade mínima para treinar é ${MIN_AGE} anos.`;
    } else if (age > MAX_AGE) {
      fieldErrors['birthDate'] = 'Confira a data de nascimento.';
    }
  }

  const cpf = onlyDigits(input.cpf);
  if (cpf.length > 0 && !isValidCpf(cpf)) {
    fieldErrors['cpf'] = 'CPF inválido. Confira os números, ou deixe em branco.';
  }

  const unit = input.unit.trim();
  if (!(UNITS as readonly string[]).includes(unit)) {
    fieldErrors['unit'] = 'Escolha a academia onde ele vai treinar.';
  }

  const gender: Gender =
    input.gender === 'masculino' || input.gender === 'feminino'
      ? input.gender
      : 'nao_informado';

  return {
    valid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
    normalized: {
      name,
      birthDate,
      cpf,
      age,
      isMinor: age < GUARDIAN_REQUIRED_AGE,
      gender,
      unit: (UNITS as readonly string[]).includes(unit)
        ? (unit as UnitId)
        : (UNITS[0] as UnitId),
    },
  };
}
