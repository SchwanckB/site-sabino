import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { UpstashMock } from './upstashMock';

/**
 * Uma conta, várias fichas.
 *
 * O Eloy treina nos adultos, o filho dele é da turma infantil e a esposa
 * também treina. Criar um e-mail para a criança de seis anos é pedir ao pai
 * que invente uma caixa de entrada e depois lembre de duas senhas — então a
 * ficha dela pendura na conta dele, e o painel alterna entre os perfis como
 * já alterna entre aluno e professor.
 *
 * O que este arquivo trava:
 *   - a ficha do dependente nasce pendente, como qualquer outra;
 *   - ela não tem login, e nada tenta apagar uma conta que não existe;
 *   - o perfil ativo é validado contra a conta — cookie não é credencial;
 *   - a presença marcada com o perfil do filho é do filho.
 */

const mock = new UpstashMock();

const pai = {
  id: 'user_eloy',
  email: 'eloy@teste.com',
  name: 'Eloy Pai',
  role: 'ALUNO' as const,
  imageUrl: null,
};
const estranho = { ...pai, id: 'user_outro', email: 'outro@teste.com', name: 'Outro Aluno' };

let atual: typeof pai = pai;

vi.mock('@/lib/auth', () => ({
  requireUser: async () => atual,
  requireStaff: async () => atual,
  requirePermission: async () => atual,
  authorize: async () => ({ ok: true, user: atual }),
  getSessionUser: async () => atual,
  isGestaoEmail: () => false,
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  unstable_cache: <T,>(fn: T): T => fn,
}));

/** O cookie do perfil ativo, em memória. */
let cookieJar = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
  }),
}));

let painel: typeof import('@/app/painel/actions');
let adminActions: typeof import('@/app/admin/actions');
let students: typeof import('@/lib/repositories/students');
let attendance: typeof import('@/lib/repositories/attendance');
let activeProfile: typeof import('@/lib/activeProfile');

beforeAll(async () => {
  const { url, token } = await mock.start();
  process.env['UPSTASH_REDIS_REST_URL'] = url;
  process.env['UPSTASH_REDIS_REST_TOKEN'] = token;
  process.env['QR_TOKEN_SECRET'] = 'segredo-de-teste-com-tamanho-suficiente';

  painel = await import('@/app/painel/actions');
  adminActions = await import('@/app/admin/actions');
  students = await import('@/lib/repositories/students');
  attendance = await import('@/lib/repositories/attendance');
  activeProfile = await import('@/lib/activeProfile');
});

afterAll(async () => {
  await mock.stop();
});

beforeEach(() => {
  mock.reset();
  cookieJar = new Map();
  atual = pai;
});

afterEach(() => {
  vi.useRealTimers();
});

const SEGUNDA = '2026-03-02';
const em = (date: string, time: string): Date => new Date(`${date}T${time}:00-03:00`);
const agora = (date: string, time: string): void => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(em(date, time));
};

/** Matricula o titular da conta, com ficha própria e ativa. */
async function matricularTitular(sessao: typeof pai, classIds: readonly string[]) {
  const quando = em('2026-02-01', '12:00');
  const pendente = await students.createPendingStudent(
    {
      id: sessao.id,
      name: sessao.name,
      email: sessao.email,
      phone: '51999990000',
      cpf: '52998224725',
      birthDate: '1990-05-10',
      belt: 'branca',
      gender: 'masculino' as const,
      unit: 'tres-cachoeiras' as const,
      guardianName: null,
      guardianPhone: null,
      guardianCpf: null,
      docBlobKey: null,
      consentVersion: 'lgpd-2026-01',
      consentAt: '2026-02-01T12:00:00.000Z',
    },
    quando,
  );

  return students.approveStudent(
    pendente,
    { classIds: [...classIds], belt: 'branca', degree: 0, notes: '' },
    quando,
  );
}

/** O formulário que o pai preenche no painel. */
function formularioDoFilho(over: Record<string, string> = {}) {
  const form = new FormData();
  form.set('name', 'Pedro Filho');
  form.set('birthDate', '2019-04-10');
  form.set('gender', 'masculino');
  form.set('unit', 'tres-cachoeiras');
  for (const [k, v] of Object.entries(over)) form.set(k, v);
  return form;
}

/* -------------------------------------------------------------------------- */

describe('o pai cadastra o filho', () => {
  it('a ficha nasce pendente, sem login, vinculada à conta', async () => {
    await matricularTitular(pai, ['seg-2030-jj']);
    agora(SEGUNDA, '10:00');

    const result = await painel.registerDependentAction(formularioDoFilho());
    expect(result.ok).toBe(true);
    expect(result.message).toContain('aprovação');

    const dependentes = await students.listDependents(pai.id);
    expect(dependentes).toHaveLength(1);

    const filho = dependentes[0];
    expect(filho?.name).toBe('Pedro Filho');
    expect(filho?.status).toBe('pendente');
    expect(filho?.guardianUserId).toBe(pai.id);
    // Id sintético: não há conta no Clerk para esta ficha.
    expect(filho && students.isDependentId(filho.id)).toBe(true);
  });

  it('o responsável vem da ficha do pai, sem digitar de novo', async () => {
    await matricularTitular(pai, ['seg-2030-jj']);
    agora(SEGUNDA, '10:00');
    await painel.registerDependentAction(formularioDoFilho());

    const filho = (await students.listDependents(pai.id))[0];
    expect(filho?.guardianName).toBe(pai.name);
    expect(filho?.guardianCpf).toBe('52998224725');
    // O e-mail da conta: é por onde a academia fala com a família.
    expect(filho?.email).toBe(pai.email);
  });

  it('a criança entra na trilha infantil pela data de nascimento', async () => {
    await matricularTitular(pai, ['seg-2030-jj']);
    agora(SEGUNDA, '10:00');
    await painel.registerDependentAction(formularioDoFilho());

    const filho = (await students.listDependents(pai.id))[0];
    expect(filho?.category).toBe('kids');
  });

  it('aparece na fila de aprovação do admin, como qualquer cadastro', async () => {
    await matricularTitular(pai, ['seg-2030-jj']);
    agora(SEGUNDA, '10:00');
    await painel.registerDependentAction(formularioDoFilho());

    const pendentes = await students.listStudentsByStatus('pendente');
    expect(pendentes.map((s) => s.name)).toContain('Pedro Filho');
  });

  it('recusa data de nascimento inválida sem gravar nada', async () => {
    await matricularTitular(pai, ['seg-2030-jj']);
    agora(SEGUNDA, '10:00');

    const result = await painel.registerDependentAction(
      formularioDoFilho({ birthDate: '2019-02-31' }),
    );

    expect(result.ok).toBe(false);
    expect(await students.listDependents(pai.id)).toEqual([]);
  });

  it('recusa o mesmo nome e nascimento duas vezes — é o dedo duplo', async () => {
    await matricularTitular(pai, ['seg-2030-jj']);
    agora(SEGUNDA, '10:00');

    expect((await painel.registerDependentAction(formularioDoFilho())).ok).toBe(true);
    const repetido = await painel.registerDependentAction(formularioDoFilho());

    expect(repetido.ok).toBe(false);
    expect(await students.listDependents(pai.id)).toHaveLength(1);
  });

  it('quem ainda não terminou o próprio cadastro não cadastra ninguém', async () => {
    agora(SEGUNDA, '10:00');

    const result = await painel.registerDependentAction(formularioDoFilho());
    expect(result.ok).toBe(false);
    expect(result.message).toContain('seu próprio cadastro');
  });
});

describe('o perfil ativo', () => {
  async function paiComFilho() {
    const fichaPai = await matricularTitular(pai, ['seg-2030-jj']);
    await painel.registerDependentAction(formularioDoFilho());
    const filho = (await students.listDependents(pai.id))[0];
    if (!filho) throw new Error('filho nao criado');
    return { fichaPai, filho };
  }

  it('sem escolha, abre no perfil do titular', async () => {
    agora(SEGUNDA, '10:00');
    const { fichaPai } = await paiComFilho();

    const perfil = await activeProfile.resolveActiveProfile(pai.id, fichaPai);
    expect(perfil?.student.id).toBe(pai.id);
    expect(perfil?.isDependent).toBe(false);
    expect(perfil?.profiles).toHaveLength(2);
  });

  it('escolhido o filho, a tela passa a ser dele', async () => {
    agora(SEGUNDA, '10:00');
    const { fichaPai, filho } = await paiComFilho();

    const form = new FormData();
    form.set('studentId', filho.id);
    await painel.switchProfileAction(form);

    const perfil = await activeProfile.resolveActiveProfile(pai.id, fichaPai);
    expect(perfil?.student.id).toBe(filho.id);
    expect(perfil?.isDependent).toBe(true);
  });

  /*
   * O cookie é um palpite, nunca uma credencial. Forjar o id de outro aluno
   * tem de cair no perfil próprio, em silêncio — não dar acesso e não
   * quebrar a tela.
   */
  it('id de outro aluno no cookie cai no perfil próprio', async () => {
    agora(SEGUNDA, '10:00');
    const { fichaPai } = await paiComFilho();
    await matricularTitular(estranho, ['seg-2030-jj']);

    const form = new FormData();
    form.set('studentId', estranho.id);
    await painel.switchProfileAction(form);

    const perfil = await activeProfile.resolveActiveProfile(pai.id, fichaPai);
    expect(perfil?.student.id).toBe(pai.id);
  });

  it('o filho de um não aparece para o outro', async () => {
    agora(SEGUNDA, '10:00');
    await paiComFilho();
    const fichaEstranho = await matricularTitular(estranho, ['seg-2030-jj']);

    const perfil = await activeProfile.resolveActiveProfile(estranho.id, fichaEstranho);
    expect(perfil?.profiles).toHaveLength(1);
    expect(perfil?.profiles[0]?.id).toBe(estranho.id);
  });
});

describe('a presença do filho', () => {
  it('com o perfil do filho aberto, o QR marca a presença dele', async () => {
    agora(SEGUNDA, '10:00');
    await matricularTitular(pai, ['seg-2030-jj']);
    await painel.registerDependentAction(formularioDoFilho());

    const filho = (await students.listDependents(pai.id))[0];
    if (!filho) throw new Error('filho nao criado');

    // A recepção aprova e põe na turma infantil de segunda.
    await students.approveStudent(
      filho,
      { classIds: ['seg-1830-kids'], belt: 'branca', degree: 0, notes: '' },
      em(SEGUNDA, '11:00'),
    );

    const form = new FormData();
    form.set('studentId', filho.id);
    await painel.switchProfileAction(form);

    agora(SEGUNDA, '18:40');
    const qr = await import('@/lib/repositories/qr');
    const result = await painel.checkinAction(
      qr.getCurrentQrToken('tres-cachoeiras').token,
      ['seg-1830-kids'],
    );

    expect(result.ok).toBe(true);

    // A presença é do filho, e o pai continua sem nenhuma.
    expect(await attendance.countCheckins(filho.id)).toBe(1);
    expect(await attendance.countCheckins(pai.id)).toBe(0);
  });
});

describe('apagar o dependente', () => {
  it('não tenta apagar login que nunca existiu', async () => {
    agora(SEGUNDA, '10:00');
    await matricularTitular(pai, ['seg-2030-jj']);
    await painel.registerDependentAction(formularioDoFilho());

    const filho = (await students.listDependents(pai.id))[0];
    if (!filho) throw new Error('filho nao criado');

    const form = new FormData();
    form.set('studentId', filho.id);
    form.set('confirmName', filho.name);

    const result = await adminActions.deleteStudentAction(form);

    expect(result.ok).toBe(true);
    // A mensagem não pode falar em login: não havia um.
    expect(result.message).not.toContain('login');
    expect(await students.getStudent(filho.id)).toBeNull();
  });

  it('some do seletor de perfil do responsável', async () => {
    agora(SEGUNDA, '10:00');
    const fichaPai = await matricularTitular(pai, ['seg-2030-jj']);
    await painel.registerDependentAction(formularioDoFilho());

    const filho = (await students.listDependents(pai.id))[0];
    if (!filho) throw new Error('filho nao criado');

    const form = new FormData();
    form.set('studentId', filho.id);
    form.set('confirmName', filho.name);
    await adminActions.deleteStudentAction(form);

    const perfil = await activeProfile.resolveActiveProfile(pai.id, fichaPai);
    expect(perfil?.profiles).toHaveLength(1);
  });
});
