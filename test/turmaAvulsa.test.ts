import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { UpstashMock } from './upstashMock';

/**
 * Turma avulsa: o sábado de manhã que não está na grade.
 *
 * A academia abre um treino num dia que normalmente não tem, e quem aparecer
 * marca presença — **sem** o professor precisar pôr a aula na ficha de cada
 * aluno. É o que separa esta da aula personalizada: lá a turma existe na
 * grade e muda de horário, e só quem a tem na ficha marca.
 *
 * O que este arquivo trava:
 *   - a aula vale só naquela data, e não vira horário fixo;
 *   - aluno que não a tem na ficha consegue marcar;
 *   - aluno de outra academia, não;
 *   - a presença conta no total e no ranking como qualquer outra;
 *   - a grade da semana continua intocada.
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
  requireStaff: async () => atual,
  requirePermission: async () => atual,
  authorize: async () => ({ ok: true, user: atual }),
  getSessionUser: async () => atual,
  isGestaoEmail: () => false,
}));

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
let oneOff: typeof import('@/lib/repositories/oneOffClasses');
let schedule: typeof import('@/lib/schedule');
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
  oneOff = await import('@/lib/repositories/oneOffClasses');
  schedule = await import('@/lib/schedule');
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

// 2026-03-07 é sábado — dia sem aula nenhuma na grade. 2026-03-14, o seguinte.
const SABADO = '2026-03-07';
const OUTRO_SABADO = '2026-03-14';
const SEXTA = '2026-03-06';

const em = (date: string, time: string): Date => new Date(`${date}T${time}:00-03:00`);
const agora = (date: string, time: string): void => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(em(date, time));
};

/** Cria o aluno e devolve a sessão dele. */
async function criarAluno(
  id: string,
  classIds: readonly string[],
  unit: 'tres-cachoeiras' | 'terra-de-areia' = 'tres-cachoeiras',
) {
  const quando = em('2026-02-01', '12:00');
  const pendente = await students.createPendingStudent(
    {
      id,
      name: `Aluno ${id}`,
      email: `${id}@teste.com`,
      phone: '51999990000',
      cpf: '52998224725',
      birthDate: '2000-05-10',
      belt: 'branca',
      gender: 'masculino' as const,
      unit,
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

  return { id, email: `${id}@teste.com`, name: `Aluno ${id}`, role: 'ALUNO', imageUrl: null } as Sessao;
}

/** O professor cria o treino de sábado pela tela de Horários. */
async function criarSabado(over: Record<string, string> = {}) {
  const form = new FormData();
  form.set('title', 'Treino de sábado');
  form.set('date', SABADO);
  form.set('startTime', '09:00');
  form.set('endTime', '10:30');
  form.set('modality', 'jiu-jitsu');
  form.set('level', 'Todas as faixas');
  form.set('unit', 'tres-cachoeiras');
  form.set('teacher', '');
  for (const [k, v] of Object.entries(over)) form.set(k, v);
  return adminActions.saveOneOffClassAction(form);
}

/* -------------------------------------------------------------------------- */

describe('criar a turma avulsa', () => {
  it('grava a aula para aquele dia', async () => {
    agora(SEXTA, '10:00');

    const result = await criarSabado();
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Qualquer aluno ativo');

    const aulas = await oneOff.listOneOffClasses();
    expect(aulas).toHaveLength(1);
    expect(aulas[0]?.date).toBe(SABADO);
    expect(aulas[0]?.title).toBe('Treino de sábado');
  });

  it('a grade da semana continua intocada', async () => {
    agora(SEXTA, '10:00');
    const antes = await schedule.getScheduleFresh();
    await criarSabado();
    const depois = await schedule.getScheduleFresh();

    expect(depois.classes).toHaveLength(antes.classes.length);
    expect(depois.classes.some((slot) => slot.title === 'Treino de sábado')).toBe(false);
  });

  it('entra na grade efetiva como aula daquela data, e aberta', async () => {
    agora(SEXTA, '10:00');
    await criarSabado();

    const efetiva = await schedule.getEffectiveScheduleFresh(em(SEXTA, '10:00'));
    const avulsa = efetiva.classes.find((slot) => slot.title === 'Treino de sábado');

    expect(avulsa).toBeDefined();
    expect(avulsa?.onlyOnDate).toBe(SABADO);
    expect(avulsa?.openToAll).toBe(true);
  });

  it('salvar o mesmo dia e horário substitui, não duplica', async () => {
    agora(SEXTA, '10:00');
    await criarSabado();
    await criarSabado({ title: 'Treino aberto' });

    const aulas = await oneOff.listOneOffClasses();
    expect(aulas).toHaveLength(1);
    expect(aulas[0]?.title).toBe('Treino aberto');
  });

  it('recusa data passada — o motor a ignoraria em silêncio', async () => {
    agora(OUTRO_SABADO, '10:00');

    const result = await criarSabado();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('já passou');
    expect(await oneOff.listOneOffClasses()).toEqual([]);
  });

  it('recusa fim antes do início', async () => {
    agora(SEXTA, '10:00');
    const result = await criarSabado({ startTime: '10:00', endTime: '09:00' });

    expect(result.ok).toBe(false);
    expect(await oneOff.listOneOffClasses()).toEqual([]);
  });

  it('recusa sem nome', async () => {
    agora(SEXTA, '10:00');
    const result = await criarSabado({ title: '' });

    expect(result.ok).toBe(false);
    expect(await oneOff.listOneOffClasses()).toEqual([]);
  });
});

describe('o aluno marca presença sem ter a turma na ficha', () => {
  /*
   * O pedido, em uma linha: "quem for marca presença sem precisar pôr na
   * ficha de cada um".
   */
  it('o aluno da segunda à noite marca presença no sábado de manhã', async () => {
    agora(SEXTA, '10:00');
    await criarSabado();

    // Este aluno só tem o Jiu-Jitsu de segunda na ficha.
    atual = await criarAluno('user_a', ['seg-2030-jj']);

    agora(SABADO, '09:10');
    const avulsa = (await oneOff.listOneOffClasses())[0];
    if (!avulsa) throw new Error('avulsa nao criada');

    const opcoes = await painel.listCheckinOptions(
      qr.getCurrentQrToken('tres-cachoeiras').token,
    );

    expect(opcoes.ok === true && opcoes.classes.map((c) => c.classId)).toEqual([avulsa.id]);

    const result = await painel.checkinAction(
      qr.getCurrentQrToken('tres-cachoeiras').token,
      [avulsa.id],
    );

    expect(result.ok).toBe(true);
    expect(await attendance.countCheckins('user_a')).toBe(1);
  });

  it('serve também para quem não tem turma nenhuma na ficha', async () => {
    agora(SEXTA, '10:00');
    await criarSabado();
    atual = await criarAluno('user_sem_turma', []);

    agora(SABADO, '09:10');
    const opcoes = await painel.listCheckinOptions(
      qr.getCurrentQrToken('tres-cachoeiras').token,
    );

    expect(opcoes.ok === true && opcoes.classes).toHaveLength(1);
  });

  it('a presença conta no total e no ranking como qualquer outra', async () => {
    agora(SEXTA, '10:00');
    await criarSabado();
    atual = await criarAluno('user_a', ['seg-2030-jj']);

    agora(SABADO, '09:10');
    const avulsa = (await oneOff.listOneOffClasses())[0];
    if (!avulsa) throw new Error('avulsa nao criada');

    await painel.checkinAction(qr.getCurrentQrToken('tres-cachoeiras').token, [avulsa.id]);

    expect(await attendance.getRanking({})).toEqual([
      { userId: 'user_a', score: 1, position: 1 },
    ]);

    const historico = await attendance.listCheckins('user_a', 5);
    expect(historico[0]?.classId).toBe(avulsa.id);
    expect(historico[0]?.classTitle).toBe('Treino de sábado');
    expect(historico[0]?.date).toBe(SABADO);
  });

  it('o professor também marca pela chamada', async () => {
    agora(SEXTA, '10:00');
    await criarSabado();
    await criarAluno('user_a', ['seg-2030-jj']);

    agora(SABADO, '11:00'); // depois do treino
    const avulsa = (await oneOff.listOneOffClasses())[0];
    if (!avulsa) throw new Error('avulsa nao criada');

    const form = new FormData();
    form.set('studentId', 'user_a');
    form.set('classId', avulsa.id);
    const result = await adminActions.markPresenceInClassAction(form);

    expect(result.ok).toBe(true);
    // Não é "presença avulsa": a turma é aberta, ninguém a tem na ficha.
    expect(result.message).not.toContain('avulsa');
    expect(await attendance.countCheckins('user_a')).toBe(1);
  });
});

describe('os limites da turma avulsa', () => {
  it('vale só naquele sábado, não no seguinte', async () => {
    agora(SEXTA, '10:00');
    await criarSabado();
    atual = await criarAluno('user_a', ['seg-2030-jj']);

    agora(OUTRO_SABADO, '09:10');
    const opcoes = await painel.listCheckinOptions(
      qr.getCurrentQrToken('tres-cachoeiras').token,
    );

    expect(opcoes.ok === true && opcoes.classes).toEqual([]);
  });

  it('aluno da outra academia não entra', async () => {
    agora(SEXTA, '10:00');
    await criarSabado({ unit: 'tres-cachoeiras' });
    atual = await criarAluno('user_terra', [], 'terra-de-areia');

    agora(SABADO, '09:10');
    const avulsa = (await oneOff.listOneOffClasses())[0];
    if (!avulsa) throw new Error('avulsa nao criada');

    // O QR da unidade dele nem oferece a aula da outra.
    const opcoes = await painel.listCheckinOptions(
      qr.getCurrentQrToken('terra-de-areia').token,
    );
    expect(opcoes.ok === true && opcoes.classes).toEqual([]);

    // E forçar o id pelo formulário também não passa.
    const result = await painel.checkinAction(
      qr.getCurrentQrToken('terra-de-areia').token,
      [avulsa.id],
    );
    expect(result.ok).toBe(false);
    expect(await attendance.countCheckins('user_terra')).toBe(0);
  });

  it('a janela é a de sempre: uma hora antes, uma hora depois', async () => {
    agora(SEXTA, '10:00');
    await criarSabado();
    atual = await criarAluno('user_a', []);

    const token = () => qr.getCurrentQrToken('tres-cachoeiras').token;

    agora(SABADO, '07:59');
    let opcoes = await painel.listCheckinOptions(token());
    expect(opcoes.ok === true && opcoes.classes).toEqual([]);

    agora(SABADO, '08:00'); // uma hora antes das 09:00
    opcoes = await painel.listCheckinOptions(token());
    expect(opcoes.ok === true && opcoes.classes).toHaveLength(1);

    agora(SABADO, '11:30'); // uma hora depois das 10:30
    opcoes = await painel.listCheckinOptions(token());
    expect(opcoes.ok === true && opcoes.classes).toHaveLength(1);

    agora(SABADO, '11:31');
    opcoes = await painel.listCheckinOptions(token());
    expect(opcoes.ok === true && opcoes.classes).toEqual([]);
  });

  it('removida, deixa de abrir — e a presença já lançada fica', async () => {
    agora(SEXTA, '10:00');
    await criarSabado();
    atual = await criarAluno('user_a', []);

    agora(SABADO, '09:10');
    const avulsa = (await oneOff.listOneOffClasses())[0];
    if (!avulsa) throw new Error('avulsa nao criada');
    await painel.checkinAction(qr.getCurrentQrToken('tres-cachoeiras').token, [avulsa.id]);

    atual = professor;
    const form = new FormData();
    form.set('id', avulsa.id);
    expect((await adminActions.deleteOneOffClassAction(form)).ok).toBe(true);

    atual = await criarAluno('user_b', []);
    const opcoes = await painel.listCheckinOptions(
      qr.getCurrentQrToken('tres-cachoeiras').token,
    );
    expect(opcoes.ok === true && opcoes.classes).toEqual([]);

    // O histórico de quem já marcou continua.
    expect(await attendance.countCheckins('user_a')).toBe(1);
  });
});
