'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/lib/auth';
import { toDocumentKind } from '@/lib/documentRules';
import { isBlobConfigured, isRedisConfigured } from '@/lib/env';
import { checkbox, text } from '@/lib/formData';
import { consumeRateLimit, rateLimitMessage } from '@/lib/rateLimit';
import { deleteDocument, uploadDocument } from '@/lib/repositories/documents';
import { createPendingStudent, getStudent } from '@/lib/repositories/students';
import { CONSENT_VERSION } from '@/types/domain';
import { validateOnboarding } from '@/utils/onboardingValidation';

import type { OnboardingState, OnboardingValues } from './state';

/**
 * Envio do pré-cadastro.
 *
 * A validação mora em `utils/onboardingValidation.ts`, que é puro e coberto por
 * testes — regra de negócio escondida dentro do handler não dá para verificar.
 * Aqui fica só o I/O: upload do documento e gravação da ficha.
 *
 * O `required` e o `accept` do formulário são conveniência de interface; o que
 * vale é esta execução no servidor.
 *
 * Todo retorno de erro devolve `values` com o que foi digitado. O React 19
 * reseta os campos não controlados quando a action termina, e sem isso o aluno
 * perdia CPF, dados do responsável e consentimento a cada erro de validação.
 */

/** O que foi digitado, para devolver ao formulário em caso de erro. */
function readValues(form: FormData): OnboardingValues {
  return {
    name: text(form, 'name'),
    phone: text(form, 'phone'),
    cpf: text(form, 'cpf'),
    birthDate: text(form, 'birthDate'),
    guardianName: text(form, 'guardianName'),
    guardianPhone: text(form, 'guardianPhone'),
    guardianCpf: text(form, 'guardianCpf'),
    gender: text(form, 'gender'),
    unit: text(form, 'unit'),
    consent: checkbox(form, 'consent'),
    docKind: text(form, 'docKind'),
  };
}

export async function submitOnboarding(
  _previous: OnboardingState,
  form: FormData,
): Promise<OnboardingState> {
  const user = await requireUser();
  const values = readValues(form);

  if (!isRedisConfigured()) {
    return {
      status: 'error',
      message: 'O banco de dados ainda não foi configurado. Avise a academia.',
      fieldErrors: {},
      values,
    };
  }

  const existing = await getStudent(user.id);
  if (existing && existing.status === 'ativo') {
    return {
      status: 'error',
      message: 'Sua matrícula já está ativa.',
      fieldErrors: {},
      values,
    };
  }

  /*
   * Teto de envios por conta.
   *
   * Dez tentativas em dez minutos acomodam com folga quem erra o CPF algumas
   * vezes e reenvia o documento, e fecham o laço automatizado que empurraria
   * arquivos de 5 MB para o Blob sem limite. A checagem fica depois das
   * validações baratas para que um erro de configuração não consuma cota.
   */
  const quota = await consumeRateLimit('onboarding', user.id, 10, 600);
  if (!quota.allowed) {
    return {
      status: 'error',
      message: rateLimitMessage(quota.retryAfter),
      fieldErrors: {},
      values,
    };
  }

  const document = form.get('document');
  const hasNewDocument = document instanceof File && document.size > 0;

  // Sem armazenamento de arquivos configurado, exigir documento travaria toda
  // matrícula. Nesse caso o cadastro segue e a ficha fica marcada sem anexo.
  const blobReady = isBlobConfigured();

  const validation = validateOnboarding(
    {
      ...values,
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
      values,
    };
  }

  /*
   * O upload vem antes de gravar a ficha: se o arquivo falhar, nada é criado.
   *
   * O caminho inverso também é tratado, e não era: upload bem-sucedido seguido
   * de falha na gravação deixava o arquivo no Blob sem nenhuma referência no
   * Redis. Ninguém acharia nem apagaria — documento de identidade de um aluno
   * parado no armazenamento, sem dono e sem prazo. `enviadoAgora` guarda a
   * chave nova para o rollback; a chave antiga, se existia, não é tocada.
   */
  let docBlobKey = existing?.docBlobKey ?? null;
  let enviadoAgora: string | null = null;

  if (hasNewDocument && document instanceof File && blobReady) {
    const upload = await uploadDocument(user.id, document);
    if (!upload.ok) {
      return {
        status: 'error',
        message: upload.error,
        fieldErrors: { document: upload.error },
        values,
      };
    }
    docBlobKey = upload.blobKey;
    enviadoAgora = upload.blobKey;
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
        // Só faz sentido registrar o tipo quando existe anexo.
        docKind: docBlobKey ? toDocumentKind(values.docKind) : 'documento',
        consentVersion: CONSENT_VERSION,
        consentAt: now.toISOString(),
      },
      now,
    );
  } catch (error) {
    console.error('[onboarding] falha ao gravar a ficha', error);

    // A ficha não existe, então o arquivo recém-enviado não tem mais dono.
    if (enviadoAgora) {
      await deleteDocument(enviadoAgora);
    }

    return {
      status: 'error',
      message:
        'Não foi possível enviar seu cadastro. Tente novamente — se persistir, avise a academia.',
      fieldErrors: {},
      values,
    };
  }

  revalidatePath('/aguardando');
  revalidatePath('/admin/aprovacoes');

  return {
    status: 'success',
    message: 'Cadastro enviado! A academia vai analisar e liberar seu acesso.',
    fieldErrors: {},
    values: null,
  };
}
