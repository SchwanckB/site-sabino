import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { UpstashMock } from './upstashMock';

/**
 * Testes das correções apontadas na revisão de código.
 *
 * Cada bloco aqui existe porque um defeito real passou por 353 testes verdes.
 * A suíte anterior cobria bem as regras puras de `utils/` e quase nada da
 * camada de actions e rotas — e era exatamente ali que os defeitos moravam.
 *
 * Os nomes dos blocos citam o problema, não a função: quando um deles quebrar,
 * o que importa é saber qual comportamento voltou a dar errado.
 */

const mock = new UpstashMock();

const aluno = {
  id: 'user_aluno',
  email: 'aluno@teste.com',
  name: 'Aluno',
  role: 'ALUNO' as const,
  imageUrl: null,
};
const professor = {
  id: 'user_admin',
  email: 'admin@teste.com',
  name: 'Professor Sabino',
  role: 'ADMIN' as const,
  imageUrl: null,
};

let atual: typeof aluno | typeof professor = aluno;
let blobLigado = false;
let uploadFalha = false;
let gravacaoFalha = false;
const blobsRemovidos: string[] = [];

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
  uploadDocument: async () =>
    uploadFalha
      ? { ok: false, error: 'Armazenamento recusou.' }
      : { ok: true, blobKey: 'documentos/user_aluno/doc.jpg' },
  validateDocument: () => null,
  resolveDocumentUrl: async () => null,
  deleteDocument: async (key: string) => {
    blobsRemovidos.push(key);
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  unstable_cache: <T,>(fn: T): T => fn,
}));

let onboarding: typeof import('@/app/onboarding/actions');
let estadoInicial: import('@/app/onboarding/state').OnboardingState;
let adminActions: typeof import('@/app/admin/actions');
let students: typeof import('@/lib/repositories/students');
let audit: typeof import('@/lib/repositories/audit');
let rateLimit: typeof import('@/lib/rateLimit');
let scheduleAdmin: typeof import('@/lib/repositories/scheduleAdmin');

beforeAll(async () => {
  const { url, token } = await mock.start();
  process.env['UPSTASH_REDIS_REST_URL'] = url;
  process.env['UPSTASH_REDIS_REST_TOKEN'] = token;

  vi.doMock('@/lib/env', async () => {
    const real = await vi.importActual<typeof import('@/lib/env')>('@/lib/env');
    return { ...real, isBlobConfigured: () => blobLigado };
  });

  // Permite simular a gravação da ficha falhando depois de o upload dar certo.
  vi.doMock('@/lib/repositories/students', async () => {
    const real =
      await vi.importActual<typeof import('@/lib/repositories/students')>(
        '@/lib/repositories/students',
      );
    return {
      ...real,
      createPendingStudent: async (...args: Parameters<typeof real.createPendingStudent>) => {
        if (gravacaoFalha) throw new Error('Redis caiu no meio da gravação');
        return real.createPendingStudent(...args);
      },
    };
  });

  onboarding = await import('@/app/onboarding/actions');
  ({ initialOnboardingState: estadoInicial } = await import('@/app/onboarding/state'));
  adminActions = await import('@/app/admin/actions');
  students = await import('@/lib/repositories/students');
  audit = await import('@/lib/repositories/audit');
  rateLimit = await import('@/lib/rateLimit');
  scheduleAdmin = await import('@/lib/repositories/scheduleAdmin');
});

afterAll(async () => {
  await mock.stop();
});

beforeEach(() => {
  mock.reset();
  atual = aluno;
  blobLigado = false;
  uploadFalha = false;
  gravacaoFalha = false;
  blobsRemovidos.length = 0;
});

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
  // A academia virou escolha obrigatória no pré-cadastro: sem ela a ficha
  // nem é criada, e era assim que o aluno de Terra de Areia caía em Três
  // Cachoeiras por omissão.
  unit: 'tres-cachoeiras',
  consent: 'on',
};

/** Cria e aprova um aluno, devolvendo a ficha ativa. */
async function alunoAtivo(): Promise<import('@/types/domain').StudentRecord> {
  atual = aluno;
  await onboarding.submitOnboarding(estadoInicial, formulario(cadastroValido));

  atual = professor;
  const aprovacao = await adminActions.approveStudentAction(
    formulario({
      studentId: 'user_aluno',
      belt: 'branca',
      degree: '0',
      planId: 'mensal',
      amount: '150,00',
      dueDay: '10',
    }),
  );
  expect(aprovacao.ok).toBe(true);

  const ficha = await students.getStudent('user_aluno');
  if (!ficha) throw new Error('ficha não criada');
  return ficha;
}

/* -------------------------------------------------------------------------- */
/* Item 1 — o onboarding apagava o que o aluno digitou                        */
/* -------------------------------------------------------------------------- */

describe('erro de validação não pode apagar o formulário', () => {
  it('devolve o que foi digitado quando o CPF está errado', async () => {
    const result = await onboarding.submitOnboarding(
      estadoInicial,
      formulario({ ...cadastroValido, cpf: '111.111.111-11' }),
    );

    expect(result.status).toBe('error');
    expect(result.fieldErrors['cpf']).toBeDefined();

    // Sem isto o React 19 devolvia todos os campos não controlados vazios e o
    // aluno tinha de preencher a ficha outra vez, anexo incluído.
    expect(result.values?.cpf).toBe('111.111.111-11');
    expect(result.values?.name).toBe('Aluno de Teste');
    expect(result.values?.phone).toBe('(51) 99999-8888');
    expect(result.values?.consent).toBe(true);
  });

  it('devolve os dados do responsável de um cadastro de menor', async () => {
    const result = await onboarding.submitOnboarding(
      estadoInicial,
      formulario({
        ...cadastroValido,
        birthDate: '2015-04-20',
        cpf: '111.111.111-11',
        guardianName: 'Mãe do Aluno',
        guardianPhone: '(51) 98888-7777',
      }),
    );

    expect(result.status).toBe('error');
    expect(result.values?.guardianName).toBe('Mãe do Aluno');
    expect(result.values?.guardianPhone).toBe('(51) 98888-7777');
  });

  it('limpa os valores no sucesso, para a próxima matrícula não herdar nada', async () => {
    const result = await onboarding.submitOnboarding(estadoInicial, formulario(cadastroValido));

    expect(result.status).toBe('success');
    expect(result.values).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Item 4 — faixa aceitava qualquer string                                    */
/* -------------------------------------------------------------------------- */

describe('faixa é conferida contra as trilhas', () => {
  it('recusa faixa inventada na promoção', async () => {
    await alunoAtivo();

    const result = await adminActions.promoteBeltAction(
      formulario({ studentId: 'user_aluno', belt: 'faixa roxa com bolinhas' }),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Faixa inválida.');
    expect((await students.getStudent('user_aluno'))?.belt).toBe('branca');
  });

  it('aceita faixa adulta real', async () => {
    await alunoAtivo();

    const result = await adminActions.promoteBeltAction(
      formulario({ studentId: 'user_aluno', belt: 'azul' }),
    );

    expect(result.ok).toBe(true);
    expect((await students.getStudent('user_aluno'))?.belt).toBe('azul');
  });

  it('aceita faixa da trilha infantil', async () => {
    await alunoAtivo();

    const result = await adminActions.promoteBeltAction(
      formulario({ studentId: 'user_aluno', belt: 'cinza-preta' }),
    );

    expect(result.ok).toBe(true);
  });

  it('recusa faixa inventada na aprovação', async () => {
    atual = aluno;
    await onboarding.submitOnboarding(estadoInicial, formulario(cadastroValido));
    atual = professor;

    const result = await adminActions.approveStudentAction(
      formulario({
        studentId: 'user_aluno',
        belt: 'coral-com-glitter',
        planId: 'mensal',
        amount: '150,00',
        dueDay: '10',
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Faixa inválida.');
    // A aprovação é abortada antes de mexer na ficha.
    expect((await students.getStudent('user_aluno'))?.status).toBe('pendente');
  });

  it('recusa faixa inventada na edição da ficha', async () => {
    await alunoAtivo();

    const result = await adminActions.updateStudentAction(
      formulario({ studentId: 'user_aluno', belt: 'preta-com-dourado', degree: '1' }),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Faixa inválida.');
  });
});

/* -------------------------------------------------------------------------- */
/* Item 8 — grau não tinha teto                                               */
/* -------------------------------------------------------------------------- */

describe('grau fica dentro da escada de 12', () => {
  it('recusa grau 9999 em vez de gravar zero sem avisar', async () => {
    atual = aluno;
    await onboarding.submitOnboarding(estadoInicial, formulario(cadastroValido));
    atual = professor;

    const result = await adminActions.approveStudentAction(
      formulario({
        studentId: 'user_aluno',
        belt: 'branca',
        degree: '9999',
        planId: 'mensal',
        amount: '150,00',
        dueDay: '10',
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Grau inválido');
  });

  it('recusa texto no lugar do número', async () => {
    atual = aluno;
    await onboarding.submitOnboarding(estadoInicial, formulario(cadastroValido));
    atual = professor;

    const result = await adminActions.approveStudentAction(
      formulario({
        studentId: 'user_aluno',
        belt: 'branca',
        degree: 'três',
        planId: 'mensal',
        amount: '150,00',
        dueDay: '10',
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Grau inválido');
  });

  it('campo vazio vale zero, que é o caso da faixa nova', async () => {
    atual = aluno;
    await onboarding.submitOnboarding(estadoInicial, formulario(cadastroValido));
    atual = professor;

    const result = await adminActions.approveStudentAction(
      formulario({
        studentId: 'user_aluno',
        belt: 'branca',
        degree: '',
        planId: 'mensal',
        amount: '150,00',
        dueDay: '10',
      }),
    );

    expect(result.ok).toBe(true);
    expect((await students.getStudent('user_aluno'))?.degree).toBe(0);
  });

  it('aceita o grau 12, que é o último da escada', async () => {
    await alunoAtivo();

    const result = await adminActions.updateStudentAction(
      formulario({ studentId: 'user_aluno', belt: 'branca', degree: '12' }),
    );

    expect(result.ok).toBe(true);
    expect((await students.getStudent('user_aluno'))?.degree).toBe(12);
  });

  it('campo vazio na edição mantém o grau atual', async () => {
    await alunoAtivo();
    await adminActions.updateStudentAction(
      formulario({ studentId: 'user_aluno', belt: 'branca', degree: '4' }),
    );

    const result = await adminActions.updateStudentAction(
      formulario({ studentId: 'user_aluno', belt: 'branca', degree: '' }),
    );

    expect(result.ok).toBe(true);
    expect((await students.getStudent('user_aluno'))?.degree).toBe(4);
  });
});

/* -------------------------------------------------------------------------- */
/* Item 6 — falha de banco se disfarçava de "já tem presença hoje"            */
/* -------------------------------------------------------------------------- */

describe('falha de banco não pode parecer presença já registrada', () => {
  it('avisa que a presença NÃO foi registrada quando o Redis não responde', async () => {
    const ficha = await alunoAtivo();
    expect(ficha.status).toBe('ativo');

    // Derruba o banco por baixo da action, como numa indisponibilidade real.
    const urlOriginal = process.env['UPSTASH_REDIS_REST_URL'];
    const tokenOriginal = process.env['UPSTASH_REDIS_REST_TOKEN'];
    delete process.env['UPSTASH_REDIS_REST_URL'];
    delete process.env['UPSTASH_REDIS_REST_TOKEN'];
    vi.resetModules();

    try {
      const acoesSemBanco = await import('@/app/admin/actions');
      atual = professor;

      const result = await acoesSemBanco.markPresenceAction(
        formulario({ studentId: 'user_aluno' }),
      );

      expect(result.ok).toBe(false);
      // A mensagem antiga era "Este aluno já tem presença hoje" — o professor
      // acreditava, não insistia, e a presença nunca entrava.
      expect(result.message).not.toContain('já tem presença');
      expect(result.message).toContain('NÃO foi registrada');
    } finally {
      process.env['UPSTASH_REDIS_REST_URL'] = urlOriginal;
      process.env['UPSTASH_REDIS_REST_TOKEN'] = tokenOriginal;
    }
  });

  it('ainda informa corretamente a presença repetida', async () => {
    await alunoAtivo();
    await scheduleAdmin.resetScheduleToSeed(new Date());
    atual = professor;

    const primeira = await adminActions.markPresenceAction(formulario({ studentId: 'user_aluno' }));
    const segunda = await adminActions.markPresenceAction(formulario({ studentId: 'user_aluno' }));

    expect(primeira.ok).toBe(true);
    expect(segunda.ok).toBe(false);
    expect(segunda.message).toContain('já tem presença');
  });
});

/* -------------------------------------------------------------------------- */
/* Item 12 — upload órfão quando a gravação falhava                           */
/* -------------------------------------------------------------------------- */

describe('documento não fica órfão no armazenamento', () => {
  it('remove o arquivo enviado quando a gravação da ficha falha', async () => {
    blobLigado = true;
    gravacaoFalha = true;

    const arquivo = new File([new Uint8Array(2048)], 'rg.jpg', { type: 'image/jpeg' });
    const result = await onboarding.submitOnboarding(
      estadoInicial,
      formulario(cadastroValido, arquivo),
    );

    expect(result.status).toBe('error');
    // Sem o rollback o arquivo ficava no Blob sem referência no Redis:
    // documento de identidade parado, sem dono e sem prazo.
    expect(blobsRemovidos).toContain('documentos/user_aluno/doc.jpg');
  });

  it('não remove nada quando a ficha é gravada', async () => {
    blobLigado = true;

    const arquivo = new File([new Uint8Array(2048)], 'rg.jpg', { type: 'image/jpeg' });
    const result = await onboarding.submitOnboarding(
      estadoInicial,
      formulario(cadastroValido, arquivo),
    );

    expect(result.status).toBe('success');
    expect(blobsRemovidos).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Item 9 — nenhum limite de tentativas                                       */
/* -------------------------------------------------------------------------- */

describe('rate limiting', () => {
  it('libera até o limite e recusa depois', async () => {
    for (let i = 1; i <= 3; i += 1) {
      const r = await rateLimit.consumeRateLimit('teste', 'quem', 3, 60);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(3 - i);
    }

    const bloqueado = await rateLimit.consumeRateLimit('teste', 'quem', 3, 60);
    expect(bloqueado.allowed).toBe(false);
    expect(bloqueado.retryAfter).toBeGreaterThan(0);
  });

  it('conta por identidade: o abuso de um não trava o outro', async () => {
    await rateLimit.consumeRateLimit('teste', 'aluno-a', 1, 60);
    const bloqueadoA = await rateLimit.consumeRateLimit('teste', 'aluno-a', 1, 60);
    const liberadoB = await rateLimit.consumeRateLimit('teste', 'aluno-b', 1, 60);

    expect(bloqueadoA.allowed).toBe(false);
    expect(liberadoB.allowed).toBe(true);
  });

  it('libera quando não há banco: a trava protege custo, não permissão', async () => {
    const url = process.env['UPSTASH_REDIS_REST_URL'];
    const token = process.env['UPSTASH_REDIS_REST_TOKEN'];
    delete process.env['UPSTASH_REDIS_REST_URL'];
    delete process.env['UPSTASH_REDIS_REST_TOKEN'];
    vi.resetModules();

    try {
      const semBanco = await import('@/lib/rateLimit');
      const r = await semBanco.consumeRateLimit('teste', 'quem', 1, 60);
      expect(r.allowed).toBe(true);
    } finally {
      process.env['UPSTASH_REDIS_REST_URL'] = url;
      process.env['UPSTASH_REDIS_REST_TOKEN'] = token;
    }
  });

  it('barra o reenvio do cadastro em laço', async () => {
    atual = aluno;

    // O limite é 10 em 10 minutos. A 11ª tentativa tem de ser recusada por
    // excesso, não por validação.
    let ultima = estadoInicial;
    for (let i = 0; i < 11; i += 1) {
      ultima = await onboarding.submitOnboarding(
        estadoInicial,
        formulario({ ...cadastroValido, cpf: '111.111.111-11' }),
      );
    }

    expect(ultima.status).toBe('error');
    expect(ultima.message).toContain('Muitas tentativas');
    // Mesmo recusando, devolve o que foi digitado.
    expect(ultima.values?.cpf).toBe('111.111.111-11');
  });
});

/* -------------------------------------------------------------------------- */
/* Item 22 — desfazer não deixava rastro                                      */
/* -------------------------------------------------------------------------- */

describe('ações destrutivas ficam na trilha de auditoria', () => {
  it('registra quem removeu a presença', async () => {
    await alunoAtivo();
    await scheduleAdmin.resetScheduleToSeed(new Date());
    atual = professor;

    await adminActions.markPresenceAction(formulario({ studentId: 'user_aluno' }));
    const result = await adminActions.undoPresenceAction(formulario({ studentId: 'user_aluno' }));
    expect(result.ok).toBe(true);

    const trilha = await audit.listAudit();
    const entrada = trilha.find((e) => e.action === 'presenca.removida');

    expect(entrada).toBeDefined();
    expect(entrada?.byId).toBe('user_admin');
    expect(entrada?.byName).toBe('Professor Sabino');
    expect(entrada?.targetId).toBe('user_aluno');
  });

  it('registra o pagamento desfeito, que era o rastro mais sentido', async () => {
    await alunoAtivo();
    atual = professor;

    await adminActions.registerPaymentAction(
      formulario({ studentId: 'user_aluno', method: 'pix' }),
    );
    const result = await adminActions.undoPaymentAction(formulario({ studentId: 'user_aluno' }));
    expect(result.ok).toBe(true);

    const trilha = await audit.listAudit();
    expect(trilha.some((e) => e.action === 'pagamento.desfeito')).toBe(true);
  });

  it('registra a recusa de cadastro com o motivo', async () => {
    atual = aluno;
    await onboarding.submitOnboarding(estadoInicial, formulario(cadastroValido));
    atual = professor;

    await adminActions.rejectStudentAction(
      formulario({ studentId: 'user_aluno', reason: 'Documento ilegível' }),
    );

    const trilha = await audit.listAudit();
    const entrada = trilha.find((e) => e.action === 'aluno.recusado');
    expect(entrada?.detail).toBe('Documento ilegível');
  });

  it('a trilha não derruba a ação quando o banco não responde', async () => {
    const url = process.env['UPSTASH_REDIS_REST_URL'];
    delete process.env['UPSTASH_REDIS_REST_URL'];
    vi.resetModules();

    try {
      const semBanco = await import('@/lib/repositories/audit');
      await expect(
        semBanco.recordAudit({
          at: new Date().toISOString(),
          action: 'presenca.removida',
          byId: 'a',
          byName: 'A',
          targetId: 'b',
          targetName: 'B',
          detail: '',
        }),
      ).resolves.toBeUndefined();
    } finally {
      process.env['UPSTASH_REDIS_REST_URL'] = url;
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Item 15 — validação de plano duplicada, com chaves divergentes             */
/* -------------------------------------------------------------------------- */

describe('validação da mensalidade é a mesma nos dois caminhos', () => {
  it('recusa dia de vencimento fora de 1..31 na aprovação e na edição', async () => {
    atual = aluno;
    await onboarding.submitOnboarding(estadoInicial, formulario(cadastroValido));
    atual = professor;

    const base = { studentId: 'user_aluno', belt: 'branca', planId: 'mensal', amount: '150,00' };

    const aprovacao = await adminActions.approveStudentAction(
      formulario({ ...base, dueDay: '45' }),
    );
    const edicao = await adminActions.updatePlanAction(formulario({ ...base, dueDay: '45' }));

    expect(aprovacao.ok).toBe(false);
    expect(edicao.ok).toBe(false);
    expect(aprovacao.message).toBe(edicao.message);
  });

  it('recusa tipo de plano inválido nos dois caminhos', async () => {
    atual = professor;
    const base = { studentId: 'user_aluno', belt: 'branca', amount: '150,00', dueDay: '10' };

    const edicao = await adminActions.updatePlanAction(
      formulario({ ...base, planId: 'vitalicio' }),
    );

    expect(edicao.ok).toBe(false);
    expect(edicao.message).toContain('mensalidade');
  });

  it('aceita a data de vencimento nas duas chaves que os formulários usam', async () => {
    await alunoAtivo();
    atual = professor;

    const comFirstDueDate = await adminActions.updatePlanAction(
      formulario({
        studentId: 'user_aluno',
        planId: 'mensal',
        amount: '150,00',
        dueDay: '10',
        firstDueDate: '2026-03-10',
      }),
    );

    // `dueDate` era a chave do formulário de edição e `firstDueDate` a da
    // aprovação. A divergência só existia por causa da duplicação.
    const comDueDate = await adminActions.updatePlanAction(
      formulario({
        studentId: 'user_aluno',
        planId: 'mensal',
        amount: '150,00',
        dueDay: '10',
        dueDate: '2026-03-10',
      }),
    );

    expect(comFirstDueDate.ok).toBe(true);
    expect(comDueDate.ok).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Foto do documento OU foto do rosto                                         */
/* -------------------------------------------------------------------------- */

describe('o anexo pode ser documento ou foto do rosto', () => {
  it('grava a escolha "foto" quando o aluno não quer mandar documento', async () => {
    blobLigado = true;
    const arquivo = new File([new Uint8Array(2048)], 'eu.jpg', { type: 'image/jpeg' });

    const result = await onboarding.submitOnboarding(
      estadoInicial,
      formulario({ ...cadastroValido, docKind: 'foto' }, arquivo),
    );

    expect(result.status).toBe('success');
    expect((await students.getStudent('user_aluno'))?.docKind).toBe('foto');
  });

  it('grava "documento" quando é o caso', async () => {
    blobLigado = true;
    const arquivo = new File([new Uint8Array(2048)], 'rg.jpg', { type: 'image/jpeg' });

    await onboarding.submitOnboarding(
      estadoInicial,
      formulario({ ...cadastroValido, docKind: 'documento' }, arquivo),
    );

    expect((await students.getStudent('user_aluno'))?.docKind).toBe('documento');
  });

  it('valor estranho cai em "documento", nunca em algo inventado', async () => {
    blobLigado = true;
    const arquivo = new File([new Uint8Array(2048)], 'x.jpg', { type: 'image/jpeg' });

    await onboarding.submitOnboarding(
      estadoInicial,
      formulario({ ...cadastroValido, docKind: 'selfie-maneira' }, arquivo),
    );

    expect((await students.getStudent('user_aluno'))?.docKind).toBe('documento');
  });

  it('sem anexo nenhum, o tipo não vira "foto" por acidente', async () => {
    // Blob desligado: o cadastro passa sem arquivo.
    const result = await onboarding.submitOnboarding(
      estadoInicial,
      formulario({ ...cadastroValido, docKind: 'foto' }),
    );

    expect(result.status).toBe('success');
    const ficha = await students.getStudent('user_aluno');
    expect(ficha?.docBlobKey).toBeNull();
    // Sem arquivo o rótulo não significa nada; não pode sugerir que há foto.
    expect(ficha?.docKind).toBe('documento');
  });

  it('a escolha volta ao formulário depois de um erro de validação', async () => {
    const result = await onboarding.submitOnboarding(
      estadoInicial,
      formulario({ ...cadastroValido, cpf: '111.111.111-11', docKind: 'foto' }),
    );

    expect(result.status).toBe('error');
    expect(result.values?.docKind).toBe('foto');
  });

  it('fichas antigas, sem o campo, são lidas como documento', async () => {
    const { toDocumentKind } = await import('@/lib/documentRules');

    // É assim que o registro gravado antes do campo existir chega do Redis.
    expect(toDocumentKind(undefined)).toBe('documento');
    expect(toDocumentKind('')).toBe('documento');
    expect(toDocumentKind(null)).toBe('documento');
    // E o único valor que muda o significado precisa ser exato.
    expect(toDocumentKind('foto')).toBe('foto');
  });
});
