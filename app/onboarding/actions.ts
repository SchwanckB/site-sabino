'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/lib/auth';
import { isBlobConfigured, isRedisConfigured } from '@/lib/env';
import { uploadDocument } from '@/lib/repositories/documents';
import { createPendingStudent, getStudent } from '@/lib/repositories/students';
import { CONSENT_VERSION } from '@/types/domain';
import { validateOnboarding } from '@/utils/onboardingValidation';

import type { OnboardingState } from './state';

/**
 * Envio do pré-cadastro.
 *
 * A validação mora em `utils/onboardingValidation.ts`, que é puro e coberto por
 * testes — regra de negócio escondida dentro do handler não dá para verificar.
 * Aqui fica só o I/O: upload do documento e gravação da ficha.
 *
 * O `required` e o `accept` do formulário são conveniência de interface; o que
 * vale é esta execução no servidor.
 */

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
    return { status: 'error', message: 'Sua matrícula já está ativa.', fieldErrors: {} };
  }

  const document = form.get('document');
  const hasNewDocument = document instanceof File && document.size > 0;

  // Sem armazenamento de arquivos configurado, exigir documento travaria toda
  // matrícula. Nesse caso o cadastro segue e a ficha fica marcada sem anexo.
  const blobReady = isBlobConfigured();

  const validation = validateOnboarding(
    {
      name: text(form, 'name'),
      phone: text(form, 'phone'),
      cpf: text(form, 'cpf'),
      birthDate: text(form, 'birthDate'),
      guardianName: text(form, 'guardianName'),
      guardianPhone: text(form, 'guardianPhone'),
      guardianCpf: text(form, 'guardianCpf'),
      gender: text(form, 'gender'),
      unit: text(form, 'unit'),
      consent: form.get('consent') === 'on',
      hasDocument: hasNewDocument || Boolean(existing?.docBlobKey),
      documentRequired: blobReady,
    },
    new Date(),
  );

  if (!validation.valid) {
    return {
      status: 'error',
      message: 'Confira os campos destacados.',
      fieldErrors: validation.fieldErrors,
    };
  }

  // O upload vem antes de gravar a ficha: se o arquivo falhar, nada é criado.
  let docBlobKey = existing?.docBlobKey ?? null;
  if (hasNewDocument && document instanceof File && blobReady) {
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
  const { normalized } = validation;

  try {
    await createPendingStudent(
      {
        id: user.id,
        name: normalized.name,
        email: user.email,
        phone: normalized.phone,
        cpf: normalized.cpf,
        birthDate: normalized.birthDate,
        gender: normalized.gender,
        unit: normalized.unit,
        belt: 'branca',
        guardianName: normalized.guardianName,
        guardianPhone: normalized.guardianPhone,
        guardianCpf: normalized.guardianCpf,
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
      message:
        'Não foi possível enviar seu cadastro. Tente novamente — se persistir, avise a academia.',
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
