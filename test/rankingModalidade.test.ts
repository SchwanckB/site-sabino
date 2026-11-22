import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { UpstashMock } from './upstashMock';

/**
 * Um ranking por modalidade.
 *
 * O ranking único era injusto por aritmética: quem treina Jiu-Jitsu **e** MMA
 * soma duas presenças por noite contra uma de quem faz só Jiu-Jitsu. O pódio
 * deixava de medir constância e passava a medir quantas modalidades a pessoa
 * faz — e, para quem treina uma só, o primeiro lugar ficava fora de alcance
 * por conta, não por esforço.
 *
 * Agora cada presença conta uma vez, na modalidade da aula em que aconteceu.
 * Quem faz as duas aparece nas duas listas e, em cada uma, compete de igual
 * para igual.
 *
 * O que este arquivo trava:
 *   - a presença entra no ranking da modalidade da aula;
 *   - o aluno de duas modalidades não passa na frente em nenhuma delas;
 *   - desfazer tira o ponto do ranking certo;
 *   - o ranking geral continua somando tudo;
 *   - presença sem turma fica fora das modalidades e dentro do geral;
 *   - a reconstrução classifica o histórico antigo pelo `classId`.
 */

const mock = new UpstashMock();

const professor = {
  id: 'user_admin',
  email: 'admin@teste.com',
  name: 'Professor',
  role: 'GESTAO' as const,
  imageUrl: null,
};

let atual: { id: string; email: string; name: string; role: string; imageUrl: null } = professor;

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

let adminActions: typeof import('@/app/admin/actions');
let students: typeof import('@/lib/repositories/students');
let attendance: typeof import('@/lib/repositories/attendance');

beforeAll(async () => {
  const { url, token } = await mock.start();
  process.env['UPSTASH_REDIS_REST_URL'] = url;
  process.env['UPSTASH_REDIS_REST_TOKEN'] = token;
  process.env['QR_TOKEN_SECRET'] = 'segredo-de-teste-com-tamanho-suficiente';

  adminActions = await import('@/app/admin/actions');
  students = await import('@/lib/repositories/students');
  attendance = await import('@/lib/repositories/attendance');
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

const SEGUNDA = '2026-03-02';
const QUARTA = '2026-03-04';
const em = (date: string, time: string): Date => new Date(`${date}T${time}:00-03:00`);
const agora = (date: string, time: string): void => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(em(date, time));
};

/** Na grade: `seg-1930-mma` é MMA, `seg-2030-jj` é jiu, `seg-1830-kids` é kids. */
const MMA = 'seg-1930-mma';
const JIU = 'seg-2030-jj';
const KIDS = 'seg-1830-kids';

async function criarAluno(id: string, classIds: readonly string[]) {
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

/** O professor lança a presença daquele aluno naquela turma. */
async function marcar(studentId: string, classId: string) {
  const form = new FormData();
  form.set('studentId', studentId);
  form.set('classId', classId);
  const result = await adminActions.markPresenceInClassAction(form);
  if (!result.ok) throw new Error(`nao marcou: ${result.message}`);
}

const pontos = async (modality: string, userId: string) =>
  (await attendance.getRankingPosition(userId, { modality }))?.score ?? 0;

/* -------------------------------------------------------------------------- */

describe('a presença entra no ranking da modalidade dela', () => {
  it('o treino de MMA pontua no MMA, e não no jiu', async () => {
    await criarAluno('user_a', [MMA]);
    agora(SEGUNDA, '20:00');

    await marcar('user_a', MMA);

    expect(await pontos('mma', 'user_a')).toBe(1);
    expect(await pontos('jiu-jitsu', 'user_a')).toBe(0);
    expect(await pontos('kids', 'user_a')).toBe(0);
  });

  it('o treino infantil pontua no infantil', async () => {
    await criarAluno('user_kid', [KIDS]);
    agora(SEGUNDA, '19:00');

    await marcar('user_kid', KIDS);

    expect(await pontos('kids', 'user_kid')).toBe(1);
    expect(await pontos('jiu-jitsu', 'user_kid')).toBe(0);
  });

  it('o ranking geral continua somando tudo', async () => {
    await criarAluno('user_a', [MMA, JIU]);
    agora(SEGUNDA, '20:00');

    await marcar('user_a', MMA);
    await marcar('user_a', JIU);

    const geral = await attendance.getRankingPosition('user_a');
    expect(geral?.score).toBe(2);
  });
});

describe('a injustiça que motivou o recorte', () => {
  it('quem faz as duas não passa na frente de quem faz uma', async () => {
    /*
     * O caso exato. Os dois apareceram nas mesmas duas noites. No ranking
     * único, o de duas modalidades tem quatro pontos contra dois — e o pódio
     * diz que ele treinou mais, quando os dois vieram igual.
     *
     * Em cada modalidade, dois a dois.
     */
    await criarAluno('user_so_jiu', [JIU]);
    await criarAluno('user_ambos', [MMA, JIU]);

    agora(SEGUNDA, '20:00');
    await marcar('user_so_jiu', JIU);
    await marcar('user_ambos', MMA);
    await marcar('user_ambos', JIU);

    agora(QUARTA, '20:00');
    await marcar('user_so_jiu', 'qua-2030-jj');
    await marcar('user_ambos', 'qua-1930-mma');
    await marcar('user_ambos', 'qua-2030-jj');

    // No geral, o de duas modalidades dobra — e é essa a distorção.
    expect((await attendance.getRankingPosition('user_ambos'))?.score).toBe(4);
    expect((await attendance.getRankingPosition('user_so_jiu'))?.score).toBe(2);

    // No jiu, empatados: foram às mesmas duas aulas de jiu.
    expect(await pontos('jiu-jitsu', 'user_ambos')).toBe(2);
    expect(await pontos('jiu-jitsu', 'user_so_jiu')).toBe(2);

    // E quem não faz MMA simplesmente não está naquela lista.
    expect(await pontos('mma', 'user_so_jiu')).toBe(0);
  });

  it('o pódio do jiu mostra os dois empatados', async () => {
    await criarAluno('user_so_jiu', [JIU]);
    await criarAluno('user_ambos', [MMA, JIU]);

    agora(SEGUNDA, '20:00');
    await marcar('user_so_jiu', JIU);
    await marcar('user_ambos', MMA);
    await marcar('user_ambos', JIU);

    const lista = await attendance.getRanking({ modality: 'jiu-jitsu', limit: 10 });
    expect(lista.map((row) => row.score)).toEqual([1, 1]);

    const noMma = await attendance.getRanking({ modality: 'mma', limit: 10 });
    expect(noMma.map((row) => row.userId)).toEqual(['user_ambos']);
  });
});

describe('desfazer tira o ponto do ranking certo', () => {
  it('desfazer o MMA não mexe no jiu', async () => {
    await criarAluno('user_a', [MMA, JIU]);
    agora(SEGUNDA, '20:00');
    await marcar('user_a', MMA);
    await marcar('user_a', JIU);

    const form = new FormData();
    form.set('studentId', 'user_a');
    form.set('classId', MMA);
    expect((await adminActions.undoPresenceAction(form)).ok).toBe(true);

    expect(await pontos('mma', 'user_a')).toBe(0);
    expect(await pontos('jiu-jitsu', 'user_a')).toBe(1);
    expect((await attendance.getRankingPosition('user_a'))?.score).toBe(1);
  });

  it('marcar e desfazer deixa tudo como estava', async () => {
    await criarAluno('user_a', [JIU]);
    agora(SEGUNDA, '20:00');

    await marcar('user_a', JIU);
    const form = new FormData();
    form.set('studentId', 'user_a');
    form.set('classId', JIU);
    await adminActions.undoPresenceAction(form);

    expect(await pontos('jiu-jitsu', 'user_a')).toBe(0);
    expect(await attendance.countCheckins('user_a')).toBe(0);
  });
});

describe('o mês tem o seu recorte', () => {
  it('a lista do mês separa por modalidade também', async () => {
    await criarAluno('user_a', [MMA, JIU]);
    agora(SEGUNDA, '20:00');
    await marcar('user_a', MMA);
    await marcar('user_a', JIU);

    const noMes = await attendance.getRankingPosition('user_a', {
      month: '2026-03',
      modality: 'mma',
    });
    expect(noMes?.score).toBe(1);

    const outroMes = await attendance.getRankingPosition('user_a', {
      month: '2026-02',
      modality: 'mma',
    });
    expect(outroMes).toBeNull();
  });
});

describe('reconstruir o histórico', () => {
  it('classifica pelo classId as presenças sem modalidade', async () => {
    /*
     * O caso da migração: tudo o que foi marcado antes de a modalidade ser
     * gravada na presença. Sem a reconstrução as listas nasceriam vazias — e
     * o aluno leria isso como "o ranking zerou", não como "o recorte é novo".
     */
    const ficha = await criarAluno('user_a', [MMA, JIU]);
    agora(SEGUNDA, '20:00');

    // Grava direto pelo repositório, sem modalidade — é a forma antiga.
    for (const classId of [MMA, JIU]) {
      await attendance.recordCheckin(
        {
          student: ficha,
          classId,
          classTitle: 'Treino',
          source: 'manual',
          registeredBy: professor.id,
        },
        em(SEGUNDA, '20:00'),
      );
    }

    expect(await pontos('mma', 'user_a')).toBe(0);

    const resultado = await attendance.rebuildModalityRankings([{ id: 'user_a' }], (classId) =>
      classId === MMA ? 'mma' : classId === JIU ? 'jiu-jitsu' : null,
    );

    expect(resultado.presencas).toBe(2);
    expect(resultado.semModalidade).toBe(0);
    expect(await pontos('mma', 'user_a')).toBe(1);
    expect(await pontos('jiu-jitsu', 'user_a')).toBe(1);
  });

  it('presença sem turma fica fora das modalidades, e dentro do geral', async () => {
    const ficha = await criarAluno('user_a', [JIU]);
    agora(SEGUNDA, '15:00');

    await attendance.recordCheckin(
      {
        student: ficha,
        classId: null,
        classTitle: null,
        source: 'manual',
        registeredBy: professor.id,
      },
      em(SEGUNDA, '15:00'),
    );

    const resultado = await attendance.rebuildModalityRankings(
      [{ id: 'user_a' }],
      () => 'jiu-jitsu',
    );

    expect(resultado.semModalidade).toBe(1);
    expect(await pontos('jiu-jitsu', 'user_a')).toBe(0);
    // No geral ela conta: o treino aconteceu, só não se sabe de qual turma.
    expect((await attendance.getRankingPosition('user_a'))?.score).toBe(1);
  });

  it('rodar duas vezes não dobra a pontuação', async () => {
    // A varredura reescreve as chaves do zero, então repetir é inofensivo —
    // e precisa ser, porque a academia vai apertar o botão de novo.
    await criarAluno('user_a', [MMA]);
    agora(SEGUNDA, '20:00');
    await marcar('user_a', MMA);

    const reconstruir = () =>
      attendance.rebuildModalityRankings([{ id: 'user_a' }], () => 'mma');

    await reconstruir();
    await reconstruir();

    expect(await pontos('mma', 'user_a')).toBe(1);
  });

  it('a action da gestão recalcula a academia inteira', async () => {
    await criarAluno('user_a', [MMA]);
    await criarAluno('user_b', [JIU]);
    agora(SEGUNDA, '20:00');
    await marcar('user_a', MMA);
    await marcar('user_b', JIU);

    const result = await adminActions.rebuildModalityRankingsAction();

    expect(result.ok).toBe(true);
    expect(result.message).toContain('2');
    expect(await pontos('mma', 'user_a')).toBe(1);
    expect(await pontos('jiu-jitsu', 'user_b')).toBe(1);
  });
});
