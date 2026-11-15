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

const pai: {
  id: string;
  email: string;
  name: string;
  role: 'ALUNO' | 'PROFESSOR' | 'GESTAO';
  imageUrl: null;
} = {
  id: 'user_eloy',
  email: 'eloy@teste.com',
  name: 'Eloy Pai',
  role: 'ALUNO',
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
let qr: typeof import('@/lib/repositories/qr');

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
  qr = await import('@/lib/repositories/qr');
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

describe('vincular quem já treina', () => {
  /*
   * A academia rodava muito antes do site.
   *
   * A criança foi matriculada na recepção, tem anos de presença e graus na
   * ficha, e o pai só agora fez conta. `registerDependentAction` não serve:
   * criaria uma segunda ficha e jogaria o histórico fora. O que falta é
   * pendurar a ficha que já existe na conta dele.
   *
   * O vínculo é concessão de acesso — quem o recebe vê a ficha inteira e
   * marca presença por aquele aluno —, então é da gestão e as recusas são
   * explícitas.
   */

  /** Matricula uma ficha qualquer, com id próprio e nome dado. */
  async function matricularOutro(id: string, name: string, over: Record<string, unknown> = {}) {
    const quando = em('2026-02-01', '12:00');
    const pendente = await students.createPendingStudent(
      {
        id,
        name,
        email: `${id}@teste.com`,
        phone: '51999990000',
        cpf: '52998224725',
        birthDate: '2015-04-10',
        belt: 'branca',
        gender: 'masculino' as const,
        unit: 'tres-cachoeiras' as const,
        guardianName: null,
        guardianPhone: null,
        guardianCpf: null,
        docBlobKey: null,
        consentVersion: 'lgpd-2026-01',
        consentAt: '2026-02-01T12:00:00.000Z',
        ...over,
      },
      quando,
    );

    return students.approveStudent(
      pendente,
      { classIds: [], belt: 'branca', degree: 0, notes: '' },
      quando,
    );
  }

  function vincular(studentId: string, guardianId: string) {
    const form = new FormData();
    form.set('studentId', studentId);
    form.set('guardianId', guardianId);
    return adminActions.linkGuardianAction(form);
  }

  it('a ficha antiga passa a aparecer no painel do pai, com o histórico', async () => {
    const fichaPai = await matricularTitular(pai, ['seg-2030-jj']);
    await matricularOutro('user_pedro', 'Pedro Antigo');

    agora(SEGUNDA, '10:00');

    // Presença lançada antes do vínculo: é o histórico que não pode se perder.
    const pedro = await students.getStudent('user_pedro');
    if (!pedro) throw new Error('sem ficha');
    await attendance.recordCheckin(
      {
        student: pedro,
        classId: 'seg-1930-mma',
        classTitle: 'MMA',
        source: 'manual',
        registeredBy: 'user_admin',
      },
      new Date(),
    );

    const result = await vincular('user_pedro', pai.id);
    expect(result.ok).toBe(true);

    const perfil = await activeProfile.resolveActiveProfile(pai.id, fichaPai);
    expect(perfil?.profiles.map((item) => item.id)).toEqual([pai.id, 'user_pedro']);

    // Mesma ficha, mesmo id, mesma presença.
    expect(await attendance.countCheckins('user_pedro')).toBe(1);
  });

  it('o pai assume o perfil vinculado e o painel é do filho', async () => {
    const fichaPai = await matricularTitular(pai, ['seg-2030-jj']);
    await matricularOutro('user_pedro', 'Pedro Antigo');
    agora(SEGUNDA, '10:00');
    await vincular('user_pedro', pai.id);

    atual = pai;
    const form = new FormData();
    form.set('studentId', 'user_pedro');
    await painel.switchProfileAction(form);

    const perfil = await activeProfile.resolveActiveProfile(pai.id, fichaPai);
    expect(perfil?.student.id).toBe('user_pedro');
    expect(perfil?.isDependent).toBe(true);
  });

  it('vínculo não encadeia: um dependente não pode ser responsável', async () => {
    await matricularTitular(pai, []);
    await matricularOutro('user_pedro', 'Pedro Antigo');
    agora(SEGUNDA, '10:00');

    await vincular('user_pedro', pai.id);

    // Pedro agora é dependente; pendurar outra ficha nele deixaria a troca de
    // perfil ambígua e daria ao dono da conta do pai o acesso a um terceiro.
    await matricularOutro('user_ana', 'Ana Antiga');
    const result = await vincular('user_ana', 'user_pedro');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('não tem login próprio');
    expect(await students.listDependentIds('user_pedro')).toEqual([]);
  });

  it('a ficha não é dependente de si mesma', async () => {
    await matricularTitular(pai, []);
    agora(SEGUNDA, '10:00');

    const result = await vincular(pai.id, pai.id);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('de si mesma');
  });

  it('trocar de responsável tira a ficha do seletor do anterior', async () => {
    const fichaPai = await matricularTitular(pai, []);
    const fichaOutro = await matricularTitular(estranho, []);
    await matricularOutro('user_pedro', 'Pedro Antigo');
    agora(SEGUNDA, '10:00');

    await vincular('user_pedro', pai.id);
    await vincular('user_pedro', estranho.id);

    const doPai = await activeProfile.resolveActiveProfile(pai.id, fichaPai);
    expect(doPai?.profiles.map((item) => item.id)).toEqual([pai.id]);

    const doOutro = await activeProfile.resolveActiveProfile(estranho.id, fichaOutro);
    expect(doOutro?.profiles.map((item) => item.id)).toEqual([estranho.id, 'user_pedro']);
  });

  it('desfazer solta a ficha, e o histórico fica', async () => {
    const fichaPai = await matricularTitular(pai, []);
    await matricularOutro('user_pedro', 'Pedro Antigo');
    agora(SEGUNDA, '10:00');
    await vincular('user_pedro', pai.id);

    const form = new FormData();
    form.set('studentId', 'user_pedro');
    const result = await adminActions.unlinkGuardianAction(form);
    expect(result.ok).toBe(true);

    const perfil = await activeProfile.resolveActiveProfile(pai.id, fichaPai);
    expect(perfil?.profiles.map((item) => item.id)).toEqual([pai.id]);

    const pedro = await students.getStudent('user_pedro');
    expect(pedro?.guardianUserId).toBeNull();
    expect(pedro?.status).toBe('ativo');
  });

  it('desfazer o vínculo de ficha sem login avisa que ninguém mais a acessa', async () => {
    await matricularTitular(pai, []);
    agora(SEGUNDA, '10:00');
    await painel.registerDependentAction(formularioDoFilho());

    const filho = (await students.listDependents(pai.id))[0];
    if (!filho) throw new Error('sem dependente');

    const form = new FormData();
    form.set('studentId', filho.id);
    const result = await adminActions.unlinkGuardianAction(form);

    expect(result.ok).toBe(true);
    expect(result.message).toContain('nenhuma conta enxerga');
  });

  it('a lista de candidatos exclui dependentes, outra academia e a própria ficha', async () => {
    await matricularTitular(pai, []);
    await matricularOutro('user_pedro', 'Pedro Antigo');
    await matricularOutro('user_longe', 'Longe Daqui', { unit: 'terra-de-areia' });
    agora(SEGUNDA, '10:00');

    // O filho sem login nunca pode ser responsável de ninguém.
    await painel.registerDependentAction(formularioDoFilho());

    const candidatos = await adminActions.listGuardianCandidatesAction('user_pedro');
    const ids = candidatos.map((item) => item.id);

    expect(ids).toContain(pai.id);
    expect(ids).not.toContain('user_pedro'); // a própria ficha
    expect(ids).not.toContain('user_longe'); // outra academia
    expect(ids.some((id) => id.startsWith('dep_'))).toBe(false);
  });
});

describe('o pai que também dá aula', () => {
  /*
   * As duas trocas convivem.
   *
   * Há professores que são pais de aluno. A troca de perfil (minha ficha ↔ a
   * do filho) e a troca de painel (aluno ↔ professor) são coisas diferentes,
   * e nenhuma pode apagar a outra: ele precisa chegar ao painel da criança
   * **e** continuar tendo o caminho para o /admin.
   *
   * O painel é escolhido pela URL — /painel ou /admin —, e o perfil por um
   * cookie que atravessa as duas áreas. O que este arquivo trava é que o
   * cookie não é afetado pelo papel: trocar para o filho e voltar ao /admin
   * não perde a escolha, e ser professor não impede assumir a ficha do filho.
   */

  const paiProfessor = { ...pai, role: 'PROFESSOR' as const };

  async function professorComFilho() {
    atual = paiProfessor;
    const fichaPai = await matricularTitular(paiProfessor, ['seg-2030-jj']);
    await painel.registerDependentAction(formularioDoFilho());

    const pendente = (await students.listDependents(paiProfessor.id))[0];
    if (!pendente) throw new Error('filho nao criado');

    // Aprovado, senão o painel dele é a sala de espera e não a ficha.
    const filho = await students.approveStudent(
      pendente,
      { classIds: ['seg-1830-kids'], belt: 'branca', degree: 0, notes: '' },
      em('2026-02-02', '12:00'),
    );

    return { fichaPai, filho };
  }

  it('o professor assume a ficha do filho', async () => {
    agora(SEGUNDA, '10:00');
    const { fichaPai, filho } = await professorComFilho();

    const form = new FormData();
    form.set('studentId', filho.id);
    await painel.switchProfileAction(form);

    const perfil = await activeProfile.resolveActiveProfile(paiProfessor.id, fichaPai);
    expect(perfil?.student.id).toBe(filho.id);
    expect(perfil?.isDependent).toBe(true);

    // E as duas fichas continuam à mão no seletor.
    expect(perfil?.profiles.map((item) => item.id)).toEqual([paiProfessor.id, filho.id]);
  });

  it('o perfil escolhido sobrevive à ida ao painel do professor', async () => {
    /*
     * O cookie é da conta, não da área: é o que permite escolher o filho no
     * cabeçalho do /admin e cair no painel dele já pronto.
     */
    agora(SEGUNDA, '10:00');
    const { fichaPai, filho } = await professorComFilho();

    const form = new FormData();
    form.set('studentId', filho.id);
    form.set('goTo', '/painel');
    await painel.switchProfileAction(form).catch(() => undefined);

    const perfil = await activeProfile.resolveActiveProfile(paiProfessor.id, fichaPai);
    expect(perfil?.student.id).toBe(filho.id);
  });

  it('voltar ao próprio perfil é uma troca como qualquer outra', async () => {
    agora(SEGUNDA, '10:00');
    const { fichaPai, filho } = await professorComFilho();

    const paraFilho = new FormData();
    paraFilho.set('studentId', filho.id);
    await painel.switchProfileAction(paraFilho);

    const devolta = new FormData();
    devolta.set('studentId', paiProfessor.id);
    await painel.switchProfileAction(devolta);

    const perfil = await activeProfile.resolveActiveProfile(paiProfessor.id, fichaPai);
    expect(perfil?.student.id).toBe(paiProfessor.id);
    expect(perfil?.isDependent).toBe(false);
  });

  it('com o perfil do filho, a presença é do filho', async () => {
    /*
     * O que torna a troca real. Antes de existir perfil ativo, o check-in era
     * sempre de quem logou — o pai batia presença por ele mesmo ao tentar
     * marcar a do filho, e a frequência da criança ficava vazia.
     */
    agora(SEGUNDA, '10:00');
    const { filho } = await professorComFilho();

    const form = new FormData();
    form.set('studentId', filho.id);
    await painel.switchProfileAction(form);

    agora(SEGUNDA, '18:40'); // Kids das 18:30
    atual = paiProfessor;

    const result = await painel.checkinAction(
      qr.getCurrentQrToken('tres-cachoeiras').token,
      ['seg-1830-kids'],
    );

    expect(result.ok).toBe(true);
    expect(await attendance.countCheckins(filho.id)).toBe(1);
    expect(await attendance.countCheckins(paiProfessor.id)).toBe(0);
  });

  it('o dependente pendente é assumido, para o pai ver a fila dele', async () => {
    /*
     * Ele clicou no nome do filho: a resposta tem de ser sobre o filho.
     *
     * Já houve o contrário — a resolução devolvia a ficha própria quando a
     * escolhida não estava ativa — e aí o clique não fazia nada visível. E
     * antes disso o layout redirecionava para /painel de dentro do /painel,
     * que é um laço. O layout agora mostra a sala de espera daquela criança.
     */
    agora(SEGUNDA, '10:00');
    atual = pai;
    const fichaPai = await matricularTitular(pai, ['seg-2030-jj']);
    await painel.registerDependentAction(formularioDoFilho());

    const filho = (await students.listDependents(pai.id))[0];
    if (!filho) throw new Error('filho nao criado');
    expect(filho.status).not.toBe('ativo');

    const form = new FormData();
    form.set('studentId', filho.id);
    await painel.switchProfileAction(form);

    const perfil = await activeProfile.resolveActiveProfile(pai.id, fichaPai);
    expect(perfil?.student.id).toBe(filho.id);
    expect(perfil?.student.status).not.toBe('ativo');
  });
});

describe('mais de um filho na mesma conta', () => {
  /*
   * Família com dois ou três filhos no tatame é comum, e a conta tem de
   * aguentar. O teto é alto de propósito (seis), e quem precisa de mais fala
   * com a recepção, que não tem teto — ela vincula pela ficha do aluno.
   *
   * O que este bloco trava é que nada no caminho assume "um dependente": nem
   * a criação, nem o seletor, nem a troca de perfil, nem a presença.
   */

  function filho(name: string, birthDate: string) {
    const form = new FormData();
    form.set('name', name);
    form.set('birthDate', birthDate);
    form.set('gender', 'masculino');
    form.set('unit', 'tres-cachoeiras');
    return form;
  }

  it('o pai cadastra três filhos, e os três ficam na conta', async () => {
    agora(SEGUNDA, '10:00');
    await matricularTitular(pai, ['seg-2030-jj']);

    expect((await painel.registerDependentAction(filho('Pedro Filho', '2017-04-10'))).ok).toBe(true);
    expect((await painel.registerDependentAction(filho('Ana Filha', '2019-08-02'))).ok).toBe(true);
    expect((await painel.registerDependentAction(filho('Luca Filho', '2021-01-20'))).ok).toBe(true);

    const dependentes = await students.listDependents(pai.id);
    expect(dependentes).toHaveLength(3);
    // Em ordem de nome: é a ordem do seletor, e ela tem de ser estável.
    expect(dependentes.map((item) => item.name)).toEqual([
      'Ana Filha',
      'Luca Filho',
      'Pedro Filho',
    ]);
  });

  it('o seletor mostra as quatro fichas: a dele e as três', async () => {
    agora(SEGUNDA, '10:00');
    const fichaPai = await matricularTitular(pai, ['seg-2030-jj']);

    await painel.registerDependentAction(filho('Pedro Filho', '2017-04-10'));
    await painel.registerDependentAction(filho('Ana Filha', '2019-08-02'));
    await painel.registerDependentAction(filho('Luca Filho', '2021-01-20'));

    const perfil = await activeProfile.resolveActiveProfile(pai.id, fichaPai);

    expect(perfil?.profiles).toHaveLength(4);
    // A ficha própria vem primeiro, sempre: é o perfil padrão da conta.
    expect(perfil?.profiles[0]?.id).toBe(pai.id);
  });

  it('a troca vai de um filho para o outro, não só para o primeiro', async () => {
    agora(SEGUNDA, '10:00');
    const fichaPai = await matricularTitular(pai, ['seg-2030-jj']);
    await painel.registerDependentAction(filho('Pedro Filho', '2017-04-10'));
    await painel.registerDependentAction(filho('Ana Filha', '2019-08-02'));

    const [ana, pedro] = await students.listDependents(pai.id);
    if (!ana || !pedro) throw new Error('faltou filho');

    const paraPedro = new FormData();
    paraPedro.set('studentId', pedro.id);
    await painel.switchProfileAction(paraPedro);
    expect((await activeProfile.resolveActiveProfile(pai.id, fichaPai))?.student.id).toBe(pedro.id);

    const paraAna = new FormData();
    paraAna.set('studentId', ana.id);
    await painel.switchProfileAction(paraAna);
    expect((await activeProfile.resolveActiveProfile(pai.id, fichaPai))?.student.id).toBe(ana.id);
  });

  it('a presença de cada filho é do filho certo', async () => {
    /*
     * É o que dá sentido a tudo: dois irmãos na mesma turma infantil, o pai
     * escaneia uma vez por cada perfil. Se a presença caísse no perfil ativo
     * errado — ou no do pai — a frequência das crianças ficaria embaralhada e
     * a graduação sairia errada.
     */
    agora(SEGUNDA, '10:00');
    await matricularTitular(pai, ['seg-2030-jj']);
    await painel.registerDependentAction(filho('Pedro Filho', '2017-04-10'));
    await painel.registerDependentAction(filho('Ana Filha', '2019-08-02'));

    const pendentes = await students.listDependents(pai.id);
    const aprovados = [];
    for (const ficha of pendentes) {
      aprovados.push(
        await students.approveStudent(
          ficha,
          { classIds: ['seg-1830-kids'], belt: 'branca', degree: 0, notes: '' },
          em('2026-02-02', '12:00'),
        ),
      );
    }

    const [ana, pedro] = aprovados;
    if (!ana || !pedro) throw new Error('faltou filho');

    agora(SEGUNDA, '18:40');
    const token = qr.getCurrentQrToken('tres-cachoeiras').token;

    const paraPedro = new FormData();
    paraPedro.set('studentId', pedro.id);
    await painel.switchProfileAction(paraPedro);
    expect((await painel.checkinAction(token, ['seg-1830-kids'])).ok).toBe(true);

    const paraAna = new FormData();
    paraAna.set('studentId', ana.id);
    await painel.switchProfileAction(paraAna);
    expect((await painel.checkinAction(token, ['seg-1830-kids'])).ok).toBe(true);

    expect(await attendance.countCheckins(pedro.id)).toBe(1);
    expect(await attendance.countCheckins(ana.id)).toBe(1);
    expect(await attendance.countCheckins(pai.id)).toBe(0);
  });

  it('dois irmãos de nomes iguais e nascimentos diferentes passam', async () => {
    // A trava de duplicata é nome **e** nascimento: ela existe para o dedo
    // duplo no botão, não para julgar que nomes uma família pode repetir.
    agora(SEGUNDA, '10:00');
    await matricularTitular(pai, ['seg-2030-jj']);

    expect((await painel.registerDependentAction(filho('João Silva', '2016-03-01'))).ok).toBe(true);
    expect((await painel.registerDependentAction(filho('João Silva', '2019-07-15'))).ok).toBe(true);

    expect(await students.listDependents(pai.id)).toHaveLength(2);
  });

  it('o mesmo cadastro repetido é barrado', async () => {
    agora(SEGUNDA, '10:00');
    await matricularTitular(pai, ['seg-2030-jj']);

    await painel.registerDependentAction(filho('Pedro Filho', '2017-04-10'));
    const repetido = await painel.registerDependentAction(filho('Pedro Filho', '2017-04-10'));

    expect(repetido.ok).toBe(false);
    expect(repetido.message).toContain('já está cadastrado');
    expect(await students.listDependents(pai.id)).toHaveLength(1);
  });

  it('acima de seis, a recepção resolve — e a mensagem diz isso', async () => {
    agora(SEGUNDA, '10:00');
    await matricularTitular(pai, ['seg-2030-jj']);

    for (let i = 0; i < 6; i += 1) {
      const result = await painel.registerDependentAction(
        filho(`Filho ${i}`, `201${i}-05-10`),
      );
      expect(result.ok).toBe(true);
    }

    const setimo = await painel.registerDependentAction(filho('Filho 7', '2022-05-10'));
    expect(setimo.ok).toBe(false);
    expect(setimo.message).toContain('recepção');
    expect(await students.listDependents(pai.id)).toHaveLength(6);
  });
});
