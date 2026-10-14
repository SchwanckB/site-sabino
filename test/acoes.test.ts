import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { UpstashMock } from './upstashMock';

/**
 * Testes da camada de Server Actions — o caminho que o usuário percorre de
 * fato ao se cadastrar e ao ser aprovado.
 *
 * O fluxo de dados já é coberto em `fluxoCompleto.test.ts`; aqui o alvo são as
 * actions: validação, autorização e as mensagens de retorno. É esta camada que
 * vinha quebrando em produção sem nenhum teste olhando para ela.
 */

const mock = new UpstashMock();

const sessao = { id: 'user_aluno', email: 'aluno@teste.com', name: 'Aluno', role: 'ALUNO' as const, imageUrl: null };
const admin = { id: 'user_admin', email: 'admin@teste.com', name: 'Professor', role: 'ADMIN' as const, imageUrl: null };

let atual: typeof sessao | typeof admin = sessao;
let blobLigado = false;

// Clerk e Vercel Blob não existem no teste; o resto é real.
vi.mock('@/lib/auth', () => ({
  requireUser: async () => atual,
  requireAdmin: async () => {
    if (atual.role !== 'ADMIN') throw new Error('NEXT_REDIRECT');
    return atual;
  },
  getSessionUser: async () => atual,
  isAdminEmail: () => false,
}));

vi.mock('@/lib/repositories/documents', () => ({
  uploadDocument: async () => ({ ok: true, blobKey: 'documentos/user_aluno/doc.jpg' }),
  validateDocument: () => null,
  resolveDocumentUrl: async () => null,
  deleteDocument: async () => undefined,
}));

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

let onboarding: typeof import('@/app/onboarding/actions');
let adminActions: typeof import('@/app/admin/actions');
let students: typeof import('@/lib/repositories/students');
let payments: typeof import('@/lib/repositories/payments');

beforeAll(async () => {
  const { url, token } = await mock.start();
  process.env['UPSTASH_REDIS_REST_URL'] = url;
  process.env['UPSTASH_REDIS_REST_TOKEN'] = token;

  vi.doMock('@/lib/env', async () => {
    const real = await vi.importActual<typeof import('@/lib/env')>('@/lib/env');
    return { ...real, isBlobConfigured: () => blobLigado };
  });

  onboarding = await import('@/app/onboarding/actions');
  adminActions = await import('@/app/admin/actions');
  students = await import('@/lib/repositories/students');
  payments = await import('@/lib/repositories/payments');
});

afterAll(async () => {
  await mock.stop();
});

beforeEach(() => {
  mock.reset();
  atual = sessao;
  blobLigado = false;
});

/** Monta o FormData como o navegador enviaria. */
function formulario(campos: Record<string, string>, arquivo?: File): FormData {
  const form = new FormData();
  for (const [chave, valor] of Object.entries(campos)) form.append(chave, valor);
  if (arquivo) form.append('document', arquivo);
  return form;
}

const cadastroValido = {
  name: 'Aluno de Teste',
  phone: '(51) 99999-8888',
  cpf: '529.982.247-25',
  birthDate: '1995-04-20',
  consent: 'on',
};

describe('cadastro do aluno (submitOnboarding)', () => {
  it('cria a ficha pendente com dados normalizados', async () => {
    const result = await onboarding.submitOnboarding(
      onboarding.initialOnboardingState,
      formulario(cadastroValido),
    );

    expect(result.status).toBe('success');

    const ficha = await students.getStudent('user_aluno');
    expect(ficha?.status).toBe('pendente');
    expect(ficha?.name).toBe('Aluno de Teste');
    expect(ficha?.phone).toBe('51999998888');
    expect(ficha?.cpf).toBe('52998224725');
    expect(ficha?.consentVersion).toBe('lgpd-2026-01');
  });

  it('funciona sem documento quando o Blob não está configurado', async () => {
    // Antes isso travava toda matrícula: o campo era exigido mas não havia
    // onde guardar o arquivo.
    const result = await onboarding.submitOnboarding(
      onboarding.initialOnboardingState,
      formulario(cadastroValido),
    );

    expect(result.status).toBe('success');
    expect((await students.getStudent('user_aluno'))?.docBlobKey).toBeNull();
  });

  it('exige documento quando o Blob está ligado', async () => {
    blobLigado = true;

    const result = await onboarding.submitOnboarding(
      onboarding.initialOnboardingState,
      formulario(cadastroValido),
    );

    expect(result.status).toBe('error');
    expect(result.fieldErrors['document']).toBeDefined();
  });

  it('aceita documento e guarda só o caminho', async () => {
    blobLigado = true;
    const arquivo = new File([new Uint8Array(1024)], 'rg.jpg', { type: 'image/jpeg' });

    const result = await onboarding.submitOnboarding(
      onboarding.initialOnboardingState,
      formulario(cadastroValido, arquivo),
    );

    expect(result.status).toBe('success');
    const ficha = await students.getStudent('user_aluno');
    expect(ficha?.docBlobKey).toBe('documentos/user_aluno/doc.jpg');
    // Caminho, nunca URL: é o que mantém o documento fora do alcance público.
    expect(ficha?.docBlobKey).not.toContain('http');
  });

  it('recusa CPF inválido sem gravar nada', async () => {
    const result = await onboarding.submitOnboarding(
      onboarding.initialOnboardingState,
      formulario({ ...cadastroValido, cpf: '111.111.111-11' }),
    );

    expect(result.status).toBe('error');
    expect(result.fieldErrors['cpf']).toBeDefined();
    expect(await students.getStudent('user_aluno')).toBeNull();
  });

  it('recusa sem o aceite de LGPD', async () => {
    const { consent: _, ...semAceite } = cadastroValido;
    const result = await onboarding.submitOnboarding(
      onboarding.initialOnboardingState,
      formulario(semAceite),
    );

    expect(result.status).toBe('error');
    expect(result.fieldErrors['consent']).toBeDefined();
  });

  it('exige responsável para menor de idade', async () => {
    const result = await onboarding.submitOnboarding(
      onboarding.initialOnboardingState,
      formulario({ ...cadastroValido, birthDate: '2016-05-10' }),
    );

    expect(result.status).toBe('error');
    expect(result.fieldErrors['guardianName']).toBeDefined();
  });

  it('aceita menor com responsável e marca como infantil', async () => {
    const result = await onboarding.submitOnboarding(
      onboarding.initialOnboardingState,
      formulario({
        ...cadastroValido,
        birthDate: '2016-05-10',
        guardianName: 'Mãe do Aluno',
        guardianPhone: '51988887777',
      }),
    );

    expect(result.status).toBe('success');
    const ficha = await students.getStudent('user_aluno');
    expect(ficha?.category).toBe('kids');
    expect(ficha?.guardianName).toBe('Mãe do Aluno');
  });

  it('reenviar depois de recusado atualiza a mesma ficha', async () => {
    await onboarding.submitOnboarding(onboarding.initialOnboardingState, formulario(cadastroValido));
    const ficha = (await students.getStudent('user_aluno'))!;
    await students.rejectStudent(ficha, 'Documento ilegível', new Date());

    const result = await onboarding.submitOnboarding(
      onboarding.initialOnboardingState,
      formulario({ ...cadastroValido, name: 'Aluno Corrigido' }),
    );

    expect(result.status).toBe('success');
    const atualizada = await students.getStudent('user_aluno');
    expect(atualizada?.status).toBe('pendente');
    expect(atualizada?.name).toBe('Aluno Corrigido');
    expect((await students.listStudentsByStatus('recusado'))).toEqual([]);
  });

  it('não deixa reenviar com matrícula já ativa', async () => {
    await onboarding.submitOnboarding(onboarding.initialOnboardingState, formulario(cadastroValido));
    const ficha = (await students.getStudent('user_aluno'))!;
    await students.approveStudent(ficha, { classIds: [], belt: 'branca', degree: 0, notes: '' }, new Date());

    const result = await onboarding.submitOnboarding(
      onboarding.initialOnboardingState,
      formulario(cadastroValido),
    );

    expect(result.status).toBe('error');
    expect(result.message).toContain('já está ativa');
  });
});

describe('autorização das ações do admin', () => {
  async function fichaPendente() {
    await onboarding.submitOnboarding(onboarding.initialOnboardingState, formulario(cadastroValido));
  }

  it('aluno não consegue aprovar ninguém', async () => {
    await fichaPendente();
    atual = sessao; // papel ALUNO

    // `requireAdmin` redireciona; aqui isso vira exceção.
    await expect(
      adminActions.approveStudentAction(
        formulario({ studentId: 'user_aluno', planId: 'mensal', amount: '150', dueDay: '11' }),
      ),
    ).rejects.toThrow();

    expect((await students.getStudent('user_aluno'))?.status).toBe('pendente');
  });

  it('admin aprova e a mensalidade fica criada junto', async () => {
    await fichaPendente();
    atual = admin;

    const result = await adminActions.approveStudentAction(
      formulario({
        studentId: 'user_aluno',
        planId: 'mensal',
        amount: '150,00',
        dueDay: '11',
        graceDays: '4',
        belt: 'branca',
        degree: '0',
        classIds: 'seg-1930-mma',
      }),
    );

    expect(result.ok).toBe(true);

    const ficha = await students.getStudent('user_aluno');
    expect(ficha?.status).toBe('ativo');
    expect(ficha?.classIds).toEqual(['seg-1930-mma']);

    const plano = await payments.getPaymentPlan('user_aluno');
    expect(plano?.amountCents).toBe(15000);
    expect(plano?.dueDay).toBe(11);
  });

  it('recusa aprovação sem valor de mensalidade', async () => {
    await fichaPendente();
    atual = admin;

    const result = await adminActions.approveStudentAction(
      formulario({ studentId: 'user_aluno', planId: 'mensal', amount: '', dueDay: '11' }),
    );

    expect(result.ok).toBe(false);
    expect((await students.getStudent('user_aluno'))?.status).toBe('pendente');
  });

  it('recusa dia de vencimento fora de 1 a 31', async () => {
    await fichaPendente();
    atual = admin;

    const result = await adminActions.approveStudentAction(
      formulario({ studentId: 'user_aluno', planId: 'mensal', amount: '150', dueDay: '45' }),
    );

    expect(result.ok).toBe(false);
  });

  it('exige motivo para recusar', async () => {
    await fichaPendente();
    atual = admin;

    const semMotivo = await adminActions.rejectStudentAction(
      formulario({ studentId: 'user_aluno', reason: '' }),
    );
    expect(semMotivo.ok).toBe(false);

    const comMotivo = await adminActions.rejectStudentAction(
      formulario({ studentId: 'user_aluno', reason: 'Documento ilegível' }),
    );
    expect(comMotivo.ok).toBe(true);
  });
});

describe('presença pelas ações do admin', () => {
  async function alunoAprovado(id = 'user_aluno') {
    atual = { ...sessao, id };
    await onboarding.submitOnboarding(onboarding.initialOnboardingState, formulario(cadastroValido));
    const ficha = (await students.getStudent(id))!;
    await students.approveStudent(
      ficha,
      { classIds: ['seg-1930-mma'], belt: 'branca', degree: 0, notes: '' },
      new Date(),
    );
    atual = admin;
  }

  it('marca presença individual', async () => {
    await alunoAprovado();

    const result = await adminActions.markPresenceAction(formulario({ studentId: 'user_aluno' }));
    expect(result.ok).toBe(true);

    const segunda = await adminActions.markPresenceAction(formulario({ studentId: 'user_aluno' }));
    expect(segunda.ok).toBe(false);
    expect(segunda.message).toContain('já tem presença');
  });

  it('marca presença em lote e relata o que aconteceu', async () => {
    await alunoAprovado('user_a');
    await alunoAprovado('user_b');

    const form = new FormData();
    form.append('studentIds', 'user_a');
    form.append('studentIds', 'user_b');

    const result = await adminActions.markPresenceBatchAction(form);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('2 presenças');

    // Repetir não duplica.
    const denovo = await adminActions.markPresenceBatchAction(form);
    expect(denovo.message).toContain('2 já tinha presença');
  });

  it('recusa lote vazio', async () => {
    atual = admin;
    const result = await adminActions.markPresenceBatchAction(new FormData());

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Selecione');
  });

  it('não marca presença de aluno não aprovado', async () => {
    atual = sessao;
    await onboarding.submitOnboarding(onboarding.initialOnboardingState, formulario(cadastroValido));
    atual = admin;

    const result = await adminActions.markPresenceAction(formulario({ studentId: 'user_aluno' }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('não está ativo');
  });

  it('desfaz a presença do dia', async () => {
    await alunoAprovado();
    await adminActions.markPresenceAction(formulario({ studentId: 'user_aluno' }));

    const result = await adminActions.undoPresenceAction(formulario({ studentId: 'user_aluno' }));
    expect(result.ok).toBe(true);

    // E pode marcar de novo.
    expect((await adminActions.markPresenceAction(formulario({ studentId: 'user_aluno' }))).ok).toBe(true);
  });
});

describe('financeiro pelas ações do admin', () => {
  async function alunoComPlano() {
    atual = sessao;
    await onboarding.submitOnboarding(onboarding.initialOnboardingState, formulario(cadastroValido));
    atual = admin;
    await adminActions.approveStudentAction(
      formulario({
        studentId: 'user_aluno',
        planId: 'mensal',
        amount: '150',
        dueDay: '11',
        graceDays: '4',
      }),
    );
  }

  it('registra pagamento e avança o vencimento', async () => {
    await alunoComPlano();
    const antes = await payments.getPaymentPlan('user_aluno');

    const result = await adminActions.registerPaymentAction(
      formulario({ studentId: 'user_aluno', method: 'pix' }),
    );
    expect(result.ok).toBe(true);

    const depois = await payments.getPaymentPlan('user_aluno');
    expect(depois?.dueDate).not.toBe(antes?.dueDate);
    expect(await payments.listPaymentHistory('user_aluno')).toHaveLength(1);
  });

  it('desfaz o último pagamento', async () => {
    await alunoComPlano();
    const antes = (await payments.getPaymentPlan('user_aluno'))!.dueDate;

    await adminActions.registerPaymentAction(formulario({ studentId: 'user_aluno', method: 'pix' }));
    const result = await adminActions.undoPaymentAction(formulario({ studentId: 'user_aluno' }));

    expect(result.ok).toBe(true);
    expect((await payments.getPaymentPlan('user_aluno'))?.dueDate).toBe(antes);
  });

  it('recusa forma de pagamento inválida', async () => {
    await alunoComPlano();

    const result = await adminActions.registerPaymentAction(
      formulario({ studentId: 'user_aluno', method: 'bitcoin' }),
    );
    expect(result.ok).toBe(false);
  });

  it('avisa quando o aluno não tem mensalidade definida', async () => {
    atual = sessao;
    await onboarding.submitOnboarding(onboarding.initialOnboardingState, formulario(cadastroValido));
    atual = admin;

    const result = await adminActions.registerPaymentAction(
      formulario({ studentId: 'user_aluno', method: 'pix' }),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain('mensalidade');
  });
});

describe('grade de horários pelas ações', () => {
  it('salva turma válida e recusa inválida', async () => {
    atual = admin;

    const ok = await adminActions.saveClassAction(
      formulario({
        weekday: '1',
        startTime: '19:30',
        endTime: '20:30',
        title: 'MMA',
        modality: 'mma',
        level: 'Todos',
      }),
    );
    expect(ok.ok).toBe(true);

    const ruim = await adminActions.saveClassAction(
      formulario({
        weekday: '1',
        startTime: '20:30',
        endTime: '19:30',
        title: 'Invertida',
        modality: 'mma',
        level: '',
      }),
    );
    expect(ruim.ok).toBe(false);
  });

  it('aluno não mexe na grade', async () => {
    atual = sessao;
    await expect(
      adminActions.saveClassAction(
        formulario({
          weekday: '1',
          startTime: '19:30',
          endTime: '20:30',
          title: 'X',
          modality: 'mma',
          level: '',
        }),
      ),
    ).rejects.toThrow();
  });
});

describe('planos da landing pelas ações', () => {
  it('salva um plano e ele passa a valer no site', async () => {
    atual = admin;

    const result = await adminActions.savePlanAction(
      formulario({
        name: 'Mensal',
        priceLabel: 'R$ 180',
        periodLabel: '/mês',
        summary: 'Sem fidelidade.',
        features: 'Uma modalidade\nHorários livres',
        highlighted: 'on',
      }),
    );
    expect(result.ok).toBe(true);

    const { getPlans } = await import('@/lib/repositories/plansAdmin');
    const { plans } = await getPlans();
    const salvo = plans.find((p) => p.name === 'Mensal');

    expect(salvo?.priceLabel).toBe('R$ 180');
    expect(salvo?.features).toEqual(['Uma modalidade', 'Horários livres']);
    // Veio do admin: deixa de ser valor de exemplo e o aviso some do site.
    expect(salvo?.isExample).toBe(false);
  });

  it('mantém apenas um plano em destaque', async () => {
    atual = admin;

    const campos = (nome: string) => ({
      name: nome,
      priceLabel: 'R$ 100',
      periodLabel: '/mês',
      summary: '',
      features: 'Item',
      highlighted: 'on',
    });

    await adminActions.savePlanAction(formulario(campos('Plano A')));
    await adminActions.savePlanAction(formulario(campos('Plano B')));

    const { getPlans } = await import('@/lib/repositories/plansAdmin');
    const { plans } = await getPlans();
    const destaques = plans.filter((p) => p.highlighted);

    expect(destaques).toHaveLength(1);
    expect(destaques[0]?.name).toBe('Plano B');
  });

  it('recusa plano sem nome ou sem valor', async () => {
    atual = admin;

    const semNome = await adminActions.savePlanAction(
      formulario({ name: '', priceLabel: 'R$ 100', periodLabel: '', summary: '', features: '' }),
    );
    expect(semNome.ok).toBe(false);

    const semValor = await adminActions.savePlanAction(
      formulario({ name: 'Plano', priceLabel: '', periodLabel: '', summary: '', features: '' }),
    );
    expect(semValor.ok).toBe(false);
  });

  it('não deixa a vitrine ficar sem nenhum plano', async () => {
    atual = admin;
    await adminActions.resetPlansAction();

    const { getPlans } = await import('@/lib/repositories/plansAdmin');
    const { plans } = await getPlans();

    for (const plan of plans.slice(0, plans.length - 1)) {
      expect((await adminActions.deletePlanAction(formulario({ id: plan.id }))).ok).toBe(true);
    }

    // Remover o último deixaria a página cair nos exemplos do seed.
    const ultimo = plans[plans.length - 1];
    const result = await adminActions.deletePlanAction(formulario({ id: ultimo!.id }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('ao menos um plano');
  });

  it('aluno não mexe nos planos', async () => {
    atual = sessao;
    await expect(
      adminActions.savePlanAction(
        formulario({ name: 'X', priceLabel: 'R$ 1', periodLabel: '', summary: '', features: '' }),
      ),
    ).rejects.toThrow();
  });
});
