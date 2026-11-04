import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { can, isStaff, type Permission } from '@/lib/roles';

import { UpstashMock } from './upstashMock';

/**
 * Presença é por **aula realizada**.
 *
 * Antes a trava era por dia, e isso produzia dois defeitos de uma vez:
 *
 *   1. quem treinava a das 19:30 e ficava para a das 20:30 contava uma
 *      presença só, e a segunda tentativa voltava "já tem presença hoje";
 *   2. a chamada de **qualquer** turma aberta mostrava esse aluno marcado,
 *      inclusive a de outro dia da semana — foi assim que "marquei hoje e
 *      apareceu que marquei quinta também" apareceu na tela do professor.
 *
 * Os dois caem do mesmo jeito: a trava passou a ser aluno + dia + turma.
 */

const mock = new UpstashMock();

const aluno = {
  id: 'user_aluno_1',
  email: 'aluno@teste.com',
  name: 'Aluno de Teste',
  role: 'ALUNO' as const,
  imageUrl: null,
};
const professor = {
  id: 'user_admin',
  email: 'admin@teste.com',
  name: 'Professor',
  role: 'GESTAO' as const,
  imageUrl: null,
};

let atual: typeof aluno | typeof professor = professor;

vi.mock('@/lib/auth', () => ({
  requireUser: async () => atual,
  requireStaff: async () => {
    if (!isStaff(atual.role)) throw new Error('NEXT_REDIRECT');
    return atual;
  },
  requirePermission: async (permission: Permission) => {
    if (!isStaff(atual.role)) throw new Error('NEXT_REDIRECT');
    if (!can(atual.role, permission)) throw new Error('NEXT_REDIRECT');
    return atual;
  },
  authorize: async (permission: Permission) => {
    if (!isStaff(atual.role)) throw new Error('NEXT_REDIRECT');
    return can(atual.role, permission)
      ? { ok: true, user: atual }
      : { ok: false, message: 'Isso é da gestão.' };
  },
  getSessionUser: async () => atual,
  isGestaoEmail: () => false,
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  unstable_cache: <T,>(fn: T): T => fn,
}));

let adminActions: typeof import('@/app/admin/actions');
let students: typeof import('@/lib/repositories/students');
let attendance: typeof import('@/lib/repositories/attendance');

beforeAll(async () => {
  const { url, token } = await mock.start();
  process.env['UPSTASH_REDIS_REST_URL'] = url;
  process.env['UPSTASH_REDIS_REST_TOKEN'] = token;

  adminActions = await import('@/app/admin/actions');
  students = await import('@/lib/repositories/students');
  attendance = await import('@/lib/repositories/attendance');
});

afterAll(async () => {
  await mock.stop();
});

beforeEach(() => {
  mock.reset();
  atual = professor;
});

afterEach(() => {
  vi.useRealTimers();
});

// 2026-03-02 é segunda; 2026-03-05 é quinta.
const SEGUNDA = '2026-03-02';
const QUINTA = '2026-03-05';

const em = (date: string, time: string): Date => new Date(`${date}T${time}:00-03:00`);
const agora = (date: string, time: string): void => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(em(date, time));
};

const fichaBase = {
  id: aluno.id,
  name: 'Aluno de Teste',
  email: 'aluno@teste.com',
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
};

async function matricular(classIds: readonly string[]) {
  const quando = em('2026-02-01', '12:00');
  const pendente = await students.createPendingStudent(fichaBase, quando);
  return students.approveStudent(
    pendente,
    { classIds: [...classIds], belt: 'branca', degree: 0, notes: '' },
    quando,
  );
}

async function marcar(classId: string) {
  const form = new FormData();
  form.set('studentId', aluno.id);
  form.set('classId', classId);
  return adminActions.markPresenceInClassAction(form);
}

/* -------------------------------------------------------------------------- */

describe('duas aulas no mesmo dia', () => {
  it('o aluno que treina 19:30 e 20:30 tem duas presenças', async () => {
    await matricular(['seg-1930-mma', 'seg-2030-jj']);
    agora(SEGUNDA, '21:00');

    expect((await marcar('seg-1930-mma')).ok).toBe(true);
    expect((await marcar('seg-2030-jj')).ok).toBe(true);

    expect(await attendance.countCheckins(aluno.id)).toBe(2);

    // E as duas pontuam: presença por aula realizada vale para o ranking.
    expect(await attendance.getRanking({})).toEqual([
      { userId: aluno.id, score: 2, position: 1 },
    ]);
  });

  it('a mesma aula duas vezes continua sendo uma presença', async () => {
    await matricular(['seg-1930-mma']);
    agora(SEGUNDA, '20:00');

    expect((await marcar('seg-1930-mma')).ok).toBe(true);

    const repetida = await marcar('seg-1930-mma');
    expect(repetida.ok).toBe(false);
    expect(repetida.message).toContain('nesta aula');

    expect(await attendance.countCheckins(aluno.id)).toBe(1);
  });

  it('dois cliques simultâneos na mesma aula registram uma só', async () => {
    await matricular(['seg-1930-mma']);
    agora(SEGUNDA, '20:00');

    const [a, b] = await Promise.all([marcar('seg-1930-mma'), marcar('seg-1930-mma')]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await attendance.countCheckins(aluno.id)).toBe(1);
  });
});

describe('a marca não vaza de uma turma para outra', () => {
  /*
   * O defeito relatado, em teste: marcar a aula de segunda não pode acender o
   * check na chamada da aula de quinta.
   */
  it('marcar uma turma não marca a outra', async () => {
    await matricular(['seg-1930-mma', 'qui-0600-jj']);
    agora(SEGUNDA, '20:00');

    await marcar('seg-1930-mma');

    const hoje = await attendance.getTodayCheckins([aluno.id], em(SEGUNDA, '20:30'));

    expect(attendance.checkinInClass(hoje, aluno.id, 'seg-1930-mma')).not.toBeNull();
    expect(attendance.checkinInClass(hoje, aluno.id, 'qui-0600-jj')).toBeNull();
  });

  it('a presença continua sendo do dia em que foi marcada', async () => {
    await matricular(['seg-1930-mma']);
    agora(SEGUNDA, '20:00');
    await marcar('seg-1930-mma');

    const historico = await attendance.listCheckins(aluno.id, 5);
    expect(historico[0]?.date).toBe(SEGUNDA);

    // Na quinta ela não aparece como presença do dia.
    const naQuinta = await attendance.getTodayCheckins([aluno.id], em(QUINTA, '07:00'));
    expect(naQuinta.get(aluno.id) ?? []).toEqual([]);
  });

  /*
   * A faixa do dia é calculada no fuso da academia. Em UTC, 22h de segunda já
   * é terça — um cálculo feito no fuso do servidor (a Vercel roda em UTC)
   * jogaria a presença das turmas da noite para o dia seguinte.
   */
  it('presença das 22h ainda é do mesmo dia civil', async () => {
    await matricular(['seg-2030-jj']);
    agora(SEGUNDA, '22:00');
    await marcar('seg-2030-jj');

    const historico = await attendance.listCheckins(aluno.id, 5);
    expect(historico[0]?.date).toBe(SEGUNDA);
    expect(historico[0]?.at.startsWith('2026-03-03')).toBe(true); // já é terça em UTC

    const hoje = await attendance.getTodayCheckins([aluno.id], em(SEGUNDA, '23:30'));
    expect(hoje.get(aluno.id)).toHaveLength(1);
  });
});

describe('desfazer acerta a presença certa', () => {
  it('remove só a aula escolhida, e a outra fica', async () => {
    await matricular(['seg-1930-mma', 'seg-2030-jj']);
    agora(SEGUNDA, '21:00');

    await marcar('seg-1930-mma');
    await marcar('seg-2030-jj');

    const form = new FormData();
    form.set('studentId', aluno.id);
    form.set('classId', 'seg-1930-mma');
    const result = await adminActions.undoPresenceAction(form);

    expect(result.ok).toBe(true);
    expect(await attendance.countCheckins(aluno.id)).toBe(1);

    const resto = await attendance.listCheckins(aluno.id, 5);
    expect(resto[0]?.classId).toBe('seg-2030-jj');

    // E o ranking desceu um ponto só.
    expect(await attendance.getRanking({})).toEqual([
      { userId: aluno.id, score: 1, position: 1 },
    ]);
  });

  it('desfazer libera a mesma aula para ser marcada de novo', async () => {
    await matricular(['seg-1930-mma']);
    agora(SEGUNDA, '20:00');

    await marcar('seg-1930-mma');

    const form = new FormData();
    form.set('studentId', aluno.id);
    form.set('classId', 'seg-1930-mma');
    await adminActions.undoPresenceAction(form);

    expect((await marcar('seg-1930-mma')).ok).toBe(true);
    expect(await attendance.countCheckins(aluno.id)).toBe(1);
  });

  it('recusa quando não há presença naquela aula', async () => {
    await matricular(['seg-1930-mma', 'seg-2030-jj']);
    agora(SEGUNDA, '21:00');
    await marcar('seg-1930-mma');

    const form = new FormData();
    form.set('studentId', aluno.id);
    form.set('classId', 'seg-2030-jj');
    const result = await adminActions.undoPresenceAction(form);

    expect(result.ok).toBe(false);
    expect(await attendance.countCheckins(aluno.id)).toBe(1);
  });
});

describe('chamada depois do horário', () => {
  /*
   * O caso que motivou a tela de chamada por turma: a aula das 6h já acabou e
   * o professor lança a presença às 10h. Com a turma escolhida, a presença
   * fica vinculada a ela — e não com `classId: null`, que é o registro que
   * some do relatório de frequência.
   */
  it('a turma escolhida vale mesmo fora da janela de check-in', async () => {
    await matricular(['qui-0600-jj']);
    agora(QUINTA, '10:00');

    expect((await marcar('qui-0600-jj')).ok).toBe(true);

    const historico = await attendance.listCheckins(aluno.id, 5);
    expect(historico[0]?.classId).toBe('qui-0600-jj');
    expect(historico[0]?.classTitle).toBe('Jiu-Jitsu');
    expect(historico[0]?.date).toBe(QUINTA);
  });

  it('em lote, a turma escolhida vale para todos os marcados', async () => {
    await matricular(['qui-0600-jj']);
    agora(QUINTA, '10:00');

    const form = new FormData();
    form.append('studentIds', aluno.id);
    form.set('classId', 'qui-0600-jj');

    const result = await adminActions.markPresenceBatchAction(form);
    expect(result.ok).toBe(true);

    const historico = await attendance.listCheckins(aluno.id, 5);
    expect(historico[0]?.classId).toBe('qui-0600-jj');
    expect(historico[0]?.source).toBe('lote');
  });

  it('sem turma escolhida e fora da janela, a presença fica sem turma', async () => {
    await matricular(['qui-0600-jj']);
    agora(QUINTA, '10:00');

    const form = new FormData();
    form.set('studentId', aluno.id);
    const result = await adminActions.markPresenceAction(form);

    expect(result.ok).toBe(true);

    // É o registro órfão que o relatório de frequência não conta. Documentado
    // aqui para que a diferença entre os dois caminhos fique visível.
    const historico = await attendance.listCheckins(aluno.id, 5);
    expect(historico[0]?.classId).toBeNull();
  });

  it('turma que não existe na grade é recusada', async () => {
    await matricular(['seg-1930-mma']);
    agora(SEGUNDA, '20:00');

    const form = new FormData();
    form.append('studentIds', aluno.id);
    form.set('classId', 'turma-que-nao-existe');

    const result = await adminActions.markPresenceBatchAction(form);
    expect(result.ok).toBe(false);
    expect(await attendance.countCheckins(aluno.id)).toBe(0);
  });
});
