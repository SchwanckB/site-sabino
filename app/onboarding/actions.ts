'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/lib/auth';
import { isRedisConfigured } from '@/lib/env';
import { uploadDocument } from '@/lib/repositories/documents';
import { createPendingStudent, getStudent } from '@/lib/repositories/students';
import { CONSENT_VERSION, GUARDIAN_REQUIRED_AGE } from '@/types/domain';
import { isValidCpf, onlyDigits } from '@/utils/cpf';
import { calculateAge } from '@/utils/graduationEngine';

/**
 * Envio do pré-cadastro.
 *
 * Tudo é validado **no servidor**: o `required` e o `accept` do formulário são
 * conveniência de interface, não barreira de segurança. O CPF é conferido pelos
 * dígitos verificadores e o documento pelo tipo e tamanho reais do arquivo.
 */

export interface OnboardingState {
  readonly status: 'idle' | 'error' | 'success';
  readonly message: string;
  readonly fieldErrors: Readonly<Record<string, string>>;
}

export const initialOnboardingState: OnboardingState = {
  status: 'idle',
  message: '',
  fieldErrors: {},
};

const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 13;

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function submitOnboarding(
  _previous: OnboardingState,
  form: FormData,
): Promise<OnboardingState> {
  const user = await requireUser();

  if (!isRedisConfigured()) {
    return {
      status: 'error',
      message: 'O banco de dados ainda não foi configurado. Avise a academia.',
      fieldErrors: {},
    };
  }

  const existing = await getStudent(user.id);
  if (existing && existing.status === 'ativo') {
    return {
      status: 'error',
      message: 'Sua matrícula já está ativa.',
      fieldErrors: {},
    };
  }

  const fieldErrors: Record<string, string> = {};

  const name = text(form, 'name');
  if (name.length < 3) fieldErrors['name'] = 'Informe o nome completo.';

  const phoneDigits = onlyDigits(text(form, 'phone'));
  if (phoneDigits.length < PHONE_MIN_DIGITS || phoneDigits.length > PHONE_MAX_DIGITS) {
    fieldErrors['phone'] = 'Informe um telefone válido com DDD.';
  }

  const cpfDigits = onlyDigits(text(form, 'cpf'));
  if (!isValidCpf(cpfDigits)) {
    fieldErrors['cpf'] = 'CPF inválido. Confira os números.';
  }

  const birthDate = text(form, 'birthDate');
  let age = 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    fieldErrors['birthDate'] = 'Informe a data de nascimento.';
  } else {
    age = calculateAge(birthDate, new Date());
    if (age < 3 || age > 100) {
      fieldErrors['birthDate'] = 'Data de nascimento fora do esperado.';
    }
  }

  // Menor de 18 exige responsável, conforme a política de matrícula.
  const isMinor = age > 0 && age < GUARDIAN_REQUIRED_AGE;
  const guardianName = text(form, 'guardianName');
  const guardianPhoneDigits = onlyDigits(text(form, 'guardianPhone'));
  const guardianCpfDigits = onlyDigits(text(form, 'guardianCpf'));

  if (isMinor) {
    if (guardianName.length < 3) {
      fieldErrors['guardianName'] = 'Informe o nome do responsável.';
    }
    if (
      guardianPhoneDigits.length < PHONE_MIN_DIGITS ||
      guardianPhoneDigits.length > PHONE_MAX_DIGITS
    ) {
      fieldErrors['guardianPhone'] = 'Informe o telefone do responsável.';
    }
    if (guardianCpfDigits.length > 0 && !isValidCpf(guardianCpfDigits)) {
      fieldErrors['guardianCpf'] = 'CPF do responsável inválido.';
    }
  }

  if (form.get('consent') !== 'on') {
    fieldErrors['consent'] = 'É necessário aceitar o uso dos dados para a matrícula.';
  }

  const document = form.get('document');
  const hasNewDocument = document instanceof File && document.size > 0;
  if (!hasNewDocument && !existing?.docBlobKey) {
    fieldErrors['document'] = 'Envie uma foto ou PDF do documento.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: 'error',
      message: 'Confira os campos destacados.',
      fieldErrors,
    };
  }

  // O upload vem antes de gravar a ficha: se o arquivo falhar, nada é criado.
  let docBlobKey = existing?.docBlobKey ?? null;
  if (hasNewDocument && document instanceof File) {
    const upload = await uploadDocument(user.id, document);
    if (!upload.ok) {
      return {
        status: 'error',
        message: upload.error,
        fieldErrors: { document: upload.error },
      };
    }
    docBlobKey = upload.blobKey;
  }

  const now = new Date();

  try {
    await createPendingStudent(
      {
        id: user.id,
        name,
        email: user.email,
        phone: phoneDigits,
        cpf: cpfDigits,
        birthDate,
        belt: 'branca',
        guardianName: isMinor ? guardianName : null,
        guardianPhone: isMinor ? guardianPhoneDigits : null,
        guardianCpf: isMinor && guardianCpfDigits.length > 0 ? guardianCpfDigits : null,
        docBlobKey,
        consentVersion: CONSENT_VERSION,
        consentAt: now.toISOString(),
      },
      now,
    );
  } catch (error) {
    console.error('[onboarding] falha ao gravar a ficha', error);
    return {
      status: 'error',
      message: 'Não foi possível enviar seu cadastro. Tente novamente.',
      fieldErrors: {},
    };
  }

  revalidatePath('/aguardando');
  revalidatePath('/admin/aprovacoes');

  return {
    status: 'success',
    message: 'Cadastro enviado! A academia vai analisar e liberar seu acesso.',
    fieldErrors: {},
  };
}
