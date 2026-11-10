import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { can, isStaff, type Permission } from '@/lib/roles';

import { UpstashMock } from './upstashMock';

/**
 * O dia inteiro, pelos olhos de quem usa.
 *
 * Os outros testes de presença olham uma peça por vez. Este percorre o
 * caminho real de ponta a ponta — aluno escaneia o cartaz, escolhe a aula,
 * volta para a segunda, o professor confere a chamada, desfaz um engano — e é
 * aqui que os defeitos de encaixe entre as peças aparecem.
 *
 * Três perfis, porque é a mistura que a academia tem de verdade:
 *   - só MMA (19:30)
 *   - só Jiu-Jitsu (20:30)
 *   - os dois, seguidos
 */

const mock = new UpstashMock();

const professor = {
  id: 'user_admin',
  email: 'admin@teste.com',
  name: 'Professor',
  role: 'GESTAO' as const,
  imageUrl: null,
};

type Sessao = { id: string; email: string; name: string; role: string; imageUrl: null };
let atual: Sessao = professor;

vi.mock('@/lib/auth', () => ({
  requireUser: async () => atual,
  requireStaff: async () => {
    if (!isStaff(atual.role as never)) throw new Error('NEXT_REDIRECT');
    return atual;
  },
  requirePermission: async (permission: Permission) => {
    if (!isStaff(atual.role as never)) throw new Error('NEXT_REDIRECT');
    if (!can(atual.role as never, permission)) throw new Error('NEXT_REDIRECT');
    return atual;
  },
  authorize: async (permission: Permission) => {
    if (!isStaff(atual.role as never)) throw new Error('NEXT_REDIRECT');
    return can(atual.role as never, permission)
      ? { ok: true, user: atual }
      : { ok: false, message: 'Isso é da gestão.' };
  },
  getSessionUser: async () => atual,
  isGestaoEmail: () => false,
}));

/*
 * O check-in resolve o perfil ativo, que mora num cookie. Sem este stub o
 * Vitest estoura com "cookies was called outside a request scope".
 */
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

vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  unstable_cache: <T,>(fn: T): T => fn,
}));

let adminActions: typeof import('@/app/admin/actions');
let painel: typeof import('@/app/painel/actions');
let students: typeof import('@/lib/repositories/students');
let attendance: typeof import('@/lib/repositories/attendance');
let qr: typeof import('@/lib/repositories/qr');

beforeAll(async () => {
  const { url, token } = await mock.start();
  process.env['UPSTASH_REDIS_REST_URL'] = url;
  process.env['UPSTASH_REDIS_REST_TOKEN'] = token;
  process.env['QR_TOKEN_SECRET'] = 'segredo-de-teste-com-tamanho-suficiente';

  adminActions = await import('@/app/admin/actions');
  painel = await import('@/app/painel/actions');
  students = await import('@/lib/repositories/students');
  attendance = await import('@/lib/repositories/attendance');
  qr = await import('@/lib/repositories/qr');
});

afterAll(async () => {
  await mock.stop();
});

beforeEach(() => {
  mock.reset();
  cookieJar = new Map();
  atual = professor;
});

afterEach(() => {
  vi.useRealTimers();
});

/** 2026-03-02, segunda. MMA 19:30-20:30, Jiu-Jitsu 20:30-21:30. */
const SEGUNDA = '2026-03-02';
const TERCA = '2026-03-03';

const em = (date: string, time: string): Date => new Date(`${date}T${time}:00-03:00`);
const agora = (date: string, time: string): void => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(em(date, time));
};

const token = (): string => qr.getCurrentQrToken('tres-cachoeiras').token;

/** Matricula um aluno nas turmas pedidas e devolve a sessão dele. */
async function criarAluno(id: string, nome: string, classIds: readonly string[]) {
  const quando = em('2026-02-01', '12:00');
  const pendente = await students.createPendingStudent(
    {
      id,
      name: nome,
      email: `${id}@teste.com`,
      phone: '51999990000',
      cpf: '52998224725',
      birthDate: '2000-05-10',
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

  await students.approveStudent(
    pendente,
    { classIds: [...classIds], belt: 'branca', degree: 0, notes: '' },
    quando,
  );

  return { id, email: `${id}@teste.com`, name: nome, role: 'ALUNO', imageUrl: null } as Sessao;
}

/** O que a tela de check-in receberia agora, para esta sessão. */
async function escanear() {
  return painel.listCheckinOptions(token());
}

/* -------------------------------------------------------------------------- */

describe('o aluno que faz SÓ MMA (19:30)', () => {
  it('escaneia às 19:40 e registra sozinho, sem perguntar', async () => {
    atual = await criarAluno('user_mma', 'Aluno do MMA', ['seg-1930-mma']);
    agora(SEGUNDA, '19:40');

    const opcoes = await escanear();
    expect(opcoes.ok).toBe(true);
    expect(opcoes.ok === true && opcoes.classes).toHaveLength(1);
    expect(opcoes.ok === true && opcoes.classes[0]?.classId).toBe('seg-1930-mma');
    expect(opcoes.ok === true && opcoes.classes[0]?.hint).toBe('acontecendo agora');

    const result = await painel.checkinAction(token(), ['seg-1930-mma']);
    expect(result.ok).toBe(true);
    expect(await attendance.countCheckins('user_mma')).toBe(1);
  });

  it('escaneando de novo, lê que já marcou — e não "sem aula agora"', async () => {
    atual = await criarAluno('user_mma', 'Aluno do MMA', ['seg-1930-mma']);
    agora(SEGUNDA, '19:40');
    await painel.checkinAction(token(), ['seg-1930-mma']);

    const opcoes = await escanear();
    expect(opcoes.ok === true && opcoes.classes).toEqual([]);
    expect(opcoes.ok === true && opcoes.alreadyDone).toContain('MMA');
    expect(await attendance.countCheckins('user_mma')).toBe(1);
  });

  it('não consegue marcar a turma de Jiu, em que não está matriculado', async () => {
    atual = await criarAluno('user_mma', 'Aluno do MMA', ['seg-1930-mma']);
    agora(SEGUNDA, '20:40');

    const result = await painel.checkinAction(token(), ['seg-2030-jj']);
    expect(result.ok).toBe(false);
    expect(await attendance.countCheckins('user_mma')).toBe(0);
  });
});

describe('o aluno que faz SÓ Jiu-Jitsu (20:30)', () => {
  it('às 19:40 a janela dele já está aberta e registra sozinho', async () => {
    atual = await criarAluno('user_jj', 'Aluno do Jiu', ['seg-2030-jj']);
    agora(SEGUNDA, '19:40');

    const opcoes = await escanear();
    expect(opcoes.ok === true && opcoes.classes).toHaveLength(1);
    expect(opcoes.ok === true && opcoes.classes[0]?.classId).toBe('seg-2030-jj');
    expect(opcoes.ok === true && opcoes.classes[0]?.hint).toContain('começa em');
  });

  it('às 18:00 ainda não abriu, e a tela diz quando é a próxima', async () => {
    atual = await criarAluno('user_jj', 'Aluno do Jiu', ['seg-2030-jj']);
    agora(SEGUNDA, '18:00');

    const opcoes = await escanear();
    expect(opcoes.ok === true && opcoes.classes).toEqual([]);
    expect(opcoes.ok === true && opcoes.nextClass).toBe('hoje às 20:30');
    expect(opcoes.ok === true && opcoes.alreadyDone).toBeNull();
  });
});

describe('o aluno que faz OS DOIS, seguidos', () => {
  it('às 19:40 a tela pergunta, com o MMA (acontecendo) primeiro', async () => {
    atual = await criarAluno('user_ambos', 'Aluno dos dois', [
      'seg-1930-mma',
      'seg-2030-jj',
    ]);
    agora(SEGUNDA, '19:40');

    const opcoes = await escanear();
    expect(opcoes.ok === true && opcoes.classes).toHaveLength(2);
    expect(opcoes.ok === true && opcoes.classes[0]?.classId).toBe('seg-1930-mma');
    expect(opcoes.ok === true && opcoes.classes[0]?.hint).toBe('acontecendo agora');
    expect(opcoes.ok === true && opcoes.classes[1]?.classId).toBe('seg-2030-jj');
  });

  /*
   * O caso do dia a dia: ele marca o MMA no começo e volta ao celular depois
   * da segunda aula. Na segunda vez não pode perguntar de novo — a única
   * pendente é o Jiu.
   */
  it('volta às 20:45 e o Jiu registra sozinho, sem nova pergunta', async () => {
    atual = await criarAluno('user_ambos', 'Aluno dos dois', [
      'seg-1930-mma',
      'seg-2030-jj',
    ]);

    agora(SEGUNDA, '19:40');
    expect((await painel.checkinAction(token(), ['seg-1930-mma'])).ok).toBe(true);

    agora(SEGUNDA, '20:45');
    const opcoes = await escanear();

    expect(opcoes.ok === true && opcoes.classes).toHaveLength(1);
    expect(opcoes.ok === true && opcoes.classes[0]?.classId).toBe('seg-2030-jj');

    expect((await painel.checkinAction(token(), ['seg-2030-jj'])).ok).toBe(true);
    expect(await attendance.countCheckins('user_ambos')).toBe(2);
  });

  /*
   * O caminho que a academia pediu: ele escaneia uma vez, na chegada, e
   * responde que fica para a seguinte. As duas presenças entram na mesma
   * leitura — sem voltar ao celular uma hora depois.
   */
  it('respondendo "as duas", marca as duas numa leitura só', async () => {
    atual = await criarAluno('user_ambos', 'Aluno dos dois', [
      'seg-1930-mma',
      'seg-2030-jj',
    ]);
    agora(SEGUNDA, '19:40');

    const result = await painel.checkinAction(token(), ['seg-1930-mma', 'seg-2030-jj']);

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.classes).toHaveLength(2);
    expect(result.ok === true && result.classes.map((c) => c.time)).toEqual(['19:30', '20:30']);
    expect(await attendance.countCheckins('user_ambos')).toBe(2);

    const historico = await attendance.listCheckins('user_ambos', 5);
    expect(historico.map((e) => e.classId).sort()).toEqual(['seg-1930-mma', 'seg-2030-jj']);
  });

  it('respondendo "só o MMA", a segunda aula fica livre para depois', async () => {
    atual = await criarAluno('user_ambos', 'Aluno dos dois', [
      'seg-1930-mma',
      'seg-2030-jj',
    ]);
    agora(SEGUNDA, '19:40');

    const result = await painel.checkinAction(token(), ['seg-1930-mma']);
    expect(result.ok === true && result.classes).toHaveLength(1);
    expect(await attendance.countCheckins('user_ambos')).toBe(1);

    // Mudou de ideia e ficou: às 20:45 o Jiu ainda está lá para marcar.
    agora(SEGUNDA, '20:45');
    const opcoes = await escanear();
    expect(opcoes.ok === true && opcoes.classes.map((c) => c.classId)).toEqual(['seg-2030-jj']);
  });

  /*
   * O cliente manda a lista, e cliente não é fonte de verdade: ids de turma
   * em que ele não está matriculado têm de cair fora, não derrubar o resto.
   */
  it('turma fora da ficha é ignorada, e a válida entra', async () => {
    atual = await criarAluno('user_mma', 'Só MMA', ['seg-1930-mma']);
    agora(SEGUNDA, '19:40');

    const result = await painel.checkinAction(token(), [
      'seg-1930-mma',
      'seg-2030-jj', // não é dele
      'qui-0600-jj', // nem é de hoje
    ]);

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.classes).toHaveLength(1);
    expect(await attendance.countCheckins('user_mma')).toBe(1);
  });

  it('o mesmo id repetido na lista não duplica', async () => {
    atual = await criarAluno('user_mma', 'Só MMA', ['seg-1930-mma']);
    agora(SEGUNDA, '19:40');

    await painel.checkinAction(token(), ['seg-1930-mma', 'seg-1930-mma']);
    expect(await attendance.countCheckins('user_mma')).toBe(1);
  });

  it('pedir de novo as duas já marcadas avisa, sem duplicar', async () => {
    atual = await criarAluno('user_ambos', 'Aluno dos dois', [
      'seg-1930-mma',
      'seg-2030-jj',
    ]);
    agora(SEGUNDA, '19:40');
    await painel.checkinAction(token(), ['seg-1930-mma', 'seg-2030-jj']);

    const denovo = await painel.checkinAction(token(), ['seg-1930-mma', 'seg-2030-jj']);
    expect(denovo.ok).toBe(false);
    expect(denovo.ok === false && denovo.reason).toBe('ja_registrado');
    expect(await attendance.countCheckins('user_ambos')).toBe(2);
  });

  it('as duas presenças pontuam no ranking', async () => {
    atual = await criarAluno('user_ambos', 'Aluno dos dois', [
      'seg-1930-mma',
      'seg-2030-jj',
    ]);
    agora(SEGUNDA, '21:00');
    await painel.checkinAction(token(), ['seg-1930-mma']);
    await painel.checkinAction(token(), ['seg-2030-jj']);

    expect(await attendance.getRanking({})).toEqual([
      { userId: 'user_ambos', score: 2, position: 1 },
    ]);
    expect(await attendance.getRanking({ month: '2026-03' })).toEqual([
      { userId: 'user_ambos', score: 2, position: 1 },
    ]);
  });

  it('depois das duas, escanear mais uma vez diz que está tudo marcado', async () => {
    atual = await criarAluno('user_ambos', 'Aluno dos dois', [
      'seg-1930-mma',
      'seg-2030-jj',
    ]);
    agora(SEGUNDA, '21:00');
    await painel.checkinAction(token(), ['seg-1930-mma']);
    await painel.checkinAction(token(), ['seg-2030-jj']);

    const opcoes = await escanear();
    expect(opcoes.ok === true && opcoes.classes).toEqual([]);
    expect(opcoes.ok === true && opcoes.alreadyDone).toContain('MMA');
    expect(opcoes.ok === true && opcoes.alreadyDone).toContain('Jiu-Jitsu');
  });

  it('o histórico guarda as duas, cada uma com a sua turma', async () => {
    atual = await criarAluno('user_ambos', 'Aluno dos dois', [
      'seg-1930-mma',
      'seg-2030-jj',
    ]);
    agora(SEGUNDA, '21:00');
    await painel.checkinAction(token(), ['seg-1930-mma']);
    await painel.checkinAction(token(), ['seg-2030-jj']);

    const historico = await attendance.listCheckins('user_ambos', 10);
    expect(historico).toHaveLength(2);
    expect(historico.map((e) => e.classId).sort()).toEqual(['seg-1930-mma', 'seg-2030-jj']);
    expect(historico.every((e) => e.date === SEGUNDA)).toBe(true);
    expect(historico.every((e) => e.source === 'qr')).toBe(true);
  });
});

describe('a chamada do professor, com os três perfis juntos', () => {
  async function academiaCheia() {
    const soMma = await criarAluno('user_mma', 'Só MMA', ['seg-1930-mma']);
    const soJj = await criarAluno('user_jj', 'Só Jiu', ['seg-2030-jj']);
    const ambos = await criarAluno('user_ambos', 'Os dois', [
      'seg-1930-mma',
      'seg-2030-jj',
    ]);
    return { soMma, soJj, ambos };
  }

  it('cada turma conta só quem veio NELA', async () => {
    const { soMma, ambos } = await academiaCheia();
    agora(SEGUNDA, '20:00');

    // O do MMA e o dos dois marcam o MMA. O do Jiu ainda não veio.
    atual = soMma;
    await painel.checkinAction(token(), ['seg-1930-mma']);
    atual = ambos;
    await painel.checkinAction(token(), ['seg-1930-mma']);

    const hoje = await attendance.getTodayCheckins(
      ['user_mma', 'user_jj', 'user_ambos'],
      em(SEGUNDA, '20:05'),
    );

    const noMma = ['user_mma', 'user_jj', 'user_ambos'].filter(
      (id) => attendance.checkinInClass(hoje, id, 'seg-1930-mma') !== null,
    );
    const noJj = ['user_mma', 'user_jj', 'user_ambos'].filter(
      (id) => attendance.checkinInClass(hoje, id, 'seg-2030-jj') !== null,
    );

    expect(noMma.sort()).toEqual(['user_ambos', 'user_mma']);
    expect(noJj).toEqual([]);
  });

  /*
   * O defeito do print: os cartões de turma mostravam a mesma contagem em
   * segunda, terça, quarta e quinta porque a conta era "tem presença hoje" e
   * não "tem presença nesta turma".
   */
  it('a turma de OUTRO dia da semana fica zerada', async () => {
    const { ambos } = await academiaCheia();
    agora(SEGUNDA, '20:00');
    atual = ambos;
    await painel.checkinAction(token(), ['seg-1930-mma']);

    const hoje = await attendance.getTodayCheckins(['user_ambos'], em(SEGUNDA, '20:05'));

    for (const outra of ['ter-2030-jj', 'qua-2030-jj', 'qui-2030-jj', 'sex-2030-jj']) {
      expect(attendance.checkinInClass(hoje, 'user_ambos', outra)).toBeNull();
    }
  });

  it('o professor marca manualmente quem esqueceu, na turma certa', async () => {
    const { soJj } = await academiaCheia();
    void soJj;
    agora(SEGUNDA, '22:30'); // depois de tudo acabar

    atual = professor;
    const form = new FormData();
    form.set('studentId', 'user_jj');
    form.set('classId', 'seg-2030-jj');
    const result = await adminActions.markPresenceInClassAction(form);

    expect(result.ok).toBe(true);

    const historico = await attendance.listCheckins('user_jj', 5);
    expect(historico[0]?.classId).toBe('seg-2030-jj');
    expect(historico[0]?.date).toBe(SEGUNDA);
    expect(historico[0]?.source).toBe('manual');
  });

  it('desfazer tira só a aula clicada', async () => {
    const { ambos } = await academiaCheia();
    agora(SEGUNDA, '21:00');
    atual = ambos;
    await painel.checkinAction(token(), ['seg-1930-mma']);
    await painel.checkinAction(token(), ['seg-2030-jj']);

    atual = professor;
    const form = new FormData();
    form.set('studentId', 'user_ambos');
    form.set('classId', 'seg-1930-mma');
    expect((await adminActions.undoPresenceAction(form)).ok).toBe(true);

    const resto = await attendance.listCheckins('user_ambos', 5);
    expect(resto).toHaveLength(1);
    expect(resto[0]?.classId).toBe('seg-2030-jj');
    expect(await attendance.getRanking({})).toEqual([
      { userId: 'user_ambos', score: 1, position: 1 },
    ]);
  });

  it('o aluno consegue remarcar o que o professor desfez', async () => {
    const { ambos } = await academiaCheia();
    agora(SEGUNDA, '21:00');
    atual = ambos;
    await painel.checkinAction(token(), ['seg-1930-mma']);

    atual = professor;
    const form = new FormData();
    form.set('studentId', 'user_ambos');
    form.set('classId', 'seg-1930-mma');
    await adminActions.undoPresenceAction(form);

    atual = ambos;
    const opcoes = await escanear();
    expect(opcoes.ok === true && opcoes.classes.map((c) => c.classId)).toContain(
      'seg-1930-mma',
    );
    expect((await painel.checkinAction(token(), ['seg-1930-mma'])).ok).toBe(true);
  });
});

describe('a virada do dia', () => {
  it('a presença de segunda não conta como presença de terça', async () => {
    atual = await criarAluno('user_ambos', 'Os dois', ['seg-2030-jj', 'ter-2030-jj']);

    agora(SEGUNDA, '21:00');
    await painel.checkinAction(token(), ['seg-2030-jj']);

    const naTerca = await attendance.getTodayCheckins(['user_ambos'], em(TERCA, '21:00'));
    expect(naTerca.get('user_ambos') ?? []).toEqual([]);
  });

  it('na terça ele marca de novo, e o total vira dois', async () => {
    atual = await criarAluno('user_ambos', 'Os dois', ['seg-2030-jj', 'ter-2030-jj']);

    agora(SEGUNDA, '21:00');
    await painel.checkinAction(token(), ['seg-2030-jj']);

    agora(TERCA, '21:00');
    expect((await painel.checkinAction(token(), ['ter-2030-jj'])).ok).toBe(true);
    expect(await attendance.countCheckins('user_ambos')).toBe(2);

    const historico = await attendance.listCheckins('user_ambos', 5);
    expect(historico.map((e) => e.date)).toEqual([TERCA, SEGUNDA]);
  });

  it('às 22h de segunda a presença ainda é de segunda, não de terça', async () => {
    atual = await criarAluno('user_jj', 'Só Jiu', ['seg-2030-jj']);
    agora(SEGUNDA, '22:00');
    await painel.checkinAction(token(), ['seg-2030-jj']);

    const historico = await attendance.listCheckins('user_jj', 5);
    expect(historico[0]?.date).toBe(SEGUNDA);
    // Em UTC já é terça: é a armadilha que o cálculo no fuso da academia evita.
    expect(historico[0]?.at.startsWith('2026-03-03')).toBe(true);
  });
});

describe('o aluno inativo e o QR de outra unidade', () => {
  it('matrícula inativa não marca presença', async () => {
    atual = await criarAluno('user_mma', 'Só MMA', ['seg-1930-mma']);

    const ficha = await students.getStudent('user_mma');
    if (!ficha) throw new Error('ficha nao encontrada');
    await students.setStudentStatus(ficha, 'inativo', em(SEGUNDA, '10:00'));

    agora(SEGUNDA, '19:40');
    const opcoes = await escanear();
    expect(opcoes.ok).toBe(false);

    const result = await painel.checkinAction(token(), ['seg-1930-mma']);
    expect(result.ok).toBe(false);
    expect(await attendance.countCheckins('user_mma')).toBe(0);
  });

  it('QR da outra academia oferece as aulas de lá, não as da ficha', async () => {
    /*
     * O cartaz é a prova de onde o aluno está.
     *
     * Ele está matriculado no MMA de Três Cachoeiras e leu o QR pregado na
     * parede de Terra de Areia: está em Terra de Areia. Antes isto era
     * recusado — "use o cartaz da academia onde você treina" —, e a saída
     * oficial era a recepção trocar a unidade da ficha dele, o que ninguém
     * desfazia depois.
     *
     * Visitante não tem turma na ficha de lá, então a lista vem das aulas
     * abertas **da casa**. A janela de horário continua valendo.
     */
    atual = await criarAluno('user_mma', 'Só MMA', ['seg-1930-mma']);
    agora(SEGUNDA, '19:40');

    const outro = qr.getCurrentQrToken('terra-de-areia').token;
    const opcoes = await painel.listCheckinOptions(outro);

    expect(opcoes.ok).toBe(true);

    const titulos = opcoes.ok === true ? opcoes.classes.map((item) => item.classId) : [];
    // A turma dele, de Três Cachoeiras, não está entre as oferecidas.
    expect(titulos).not.toContain('seg-1930-mma');
    expect(titulos.every((id) => id.startsWith('terra-de-areia'))).toBe(true);
  });

  it('o visitante registra a presença na aula da casa', async () => {
    atual = await criarAluno('user_mma', 'Só MMA', ['seg-1930-mma']);
    agora(SEGUNDA, '19:40');

    const token = qr.getCurrentQrToken('terra-de-areia').token;
    const opcoes = await painel.listCheckinOptions(token);
    const primeira = opcoes.ok === true ? opcoes.classes[0] : null;
    if (!primeira) throw new Error('nenhuma aula aberta em Terra de Areia');

    const result = await painel.checkinAction(token, [primeira.classId]);
    expect(result.ok).toBe(true);
    expect(await attendance.countCheckins('user_mma')).toBe(1);
  });

  it('a janela continua valendo para o visitante', async () => {
    // Três da tarde: nada aberto em nenhuma das duas academias.
    atual = await criarAluno('user_mma', 'Só MMA', ['seg-1930-mma']);
    agora(SEGUNDA, '15:00');

    const token = qr.getCurrentQrToken('terra-de-areia').token;
    const opcoes = await painel.listCheckinOptions(token);

    expect(opcoes.ok === true && opcoes.classes).toEqual([]);
    expect((await painel.checkinAction(token, ['terra-de-areia-1-1930-jj-fem'])).ok).toBe(false);
  });
});
