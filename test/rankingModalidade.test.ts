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
 *   - a reconstrução classifica o histórico antigo pelo `classId`;
 *   - e cada academia tem as suas listas, pela unidade da **ficha** do aluno.
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

/** As duas academias. O ranking do aluno é sempre o da ficha **dele**. */
const TC = 'tres-cachoeiras';
const TA = 'terra-de-areia';

/** Na grade: `seg-1930-mma` é MMA, `seg-2030-jj` é jiu, `seg-1830-kids` é kids. */
const MMA = 'seg-1930-mma';
const JIU = 'seg-2030-jj';
const KIDS = 'seg-1830-kids';

async function criarAluno(
  id: string,
  classIds: readonly string[],
  unit: 'tres-cachoeiras' | 'terra-de-areia' = TC,
  // A data de nascimento decide a categoria, e a categoria decide em que
  // lista de ranking a presença conta. Ver `listaDeRanking`.
  birthDate = '2000-05-10',
) {
  const quando = em('2026-02-01', '12:00');
  const pendente = await students.createPendingStudent(
    {
      id,
      name: `Aluno ${id}`,
      email: `${id}@teste.com`,
      phone: '51999990000',
      cpf: '52998224725',
      birthDate,
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

const pontos = async (modality: string, userId: string, unit = TC) =>
  (await attendance.getRankingPosition(userId, { modality, unit }))?.score ?? 0;

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
    await criarAluno('user_kid', [KIDS], TC, '2018-04-10');
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

    const lista = await attendance.getRanking({ modality: 'jiu-jitsu', unit: TC, limit: 10 });
    expect(lista.map((row) => row.score)).toEqual([1, 1]);

    const noMma = await attendance.getRanking({ modality: 'mma', unit: TC, limit: 10 });
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
      unit: TC,
    });
    expect(noMes?.score).toBe(1);

    const outroMes = await attendance.getRankingPosition('user_a', {
      month: '2026-02',
      modality: 'mma',
      unit: TC,
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

    const resultado = await attendance.rebuildModalityRankings([{ id: 'user_a', unit: TC, gender: 'masculino', category: 'adulto' }], (classId) =>
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
      [{ id: 'user_a', unit: TC, gender: 'masculino', category: 'adulto' }],
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
      attendance.rebuildModalityRankings([{ id: 'user_a', unit: TC, gender: 'masculino', category: 'adulto' }], () => 'mma');

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

describe('cada academia tem o seu ranking', () => {
  /*
   * São duas unidades, com grades e tamanhos diferentes, a meia hora uma da
   * outra. Disputar pódio com quem treina na outra cidade não diz nada a
   * ninguém — e a maior sempre ganharia por ter mais aulas na semana.
   *
   * O recorte é a unidade da **ficha**: onde o aluno é de casa. A visita de
   * uma noite à outra academia conta para ele no ranking dele, e não o insere
   * no pódio de uma academia que não é a sua.
   */

  it('o aluno pontua na academia da ficha dele', async () => {
    await criarAluno('user_tc', [JIU], TC);
    await criarAluno('user_ta', ['terra-de-areia-1-2030-jj'], TA);

    agora(SEGUNDA, '20:00');
    await marcar('user_tc', JIU);
    await marcar('user_ta', 'terra-de-areia-1-2030-jj');

    expect(await pontos('jiu-jitsu', 'user_tc', TC)).toBe(1);
    expect(await pontos('jiu-jitsu', 'user_ta', TA)).toBe(1);

    // E nenhum aparece na lista do outro.
    expect(await pontos('jiu-jitsu', 'user_tc', TA)).toBe(0);
    expect(await pontos('jiu-jitsu', 'user_ta', TC)).toBe(0);
  });

  it('o pódio de uma academia não traz gente da outra', async () => {
    await criarAluno('user_tc', [JIU], TC);
    await criarAluno('user_ta', ['terra-de-areia-1-2030-jj'], TA);

    agora(SEGUNDA, '20:00');
    await marcar('user_tc', JIU);
    await marcar('user_ta', 'terra-de-areia-1-2030-jj');

    const emTc = await attendance.getRanking({ unit: TC, limit: 10 });
    expect(emTc.map((row) => row.userId)).toEqual(['user_tc']);

    const emTa = await attendance.getRanking({ unit: TA, limit: 10 });
    expect(emTa.map((row) => row.userId)).toEqual(['user_ta']);
  });

  it('a visita à outra academia conta no ranking de casa', async () => {
    /*
     * O aluno de Terra de Areia que apareceu numa quinta em Três Cachoeiras
     * treinou — a presença é dele e conta. Mas ele não é de casa ali, e pô-lo
     * no pódio de Três Cachoeiras competindo com quem treina lá toda semana
     * seria trocar uma injustiça por outra.
     */
    await criarAluno('user_ta', ['terra-de-areia-1-2030-jj'], TA);

    agora(SEGUNDA, '20:00');
    await marcar('user_ta', JIU); // turma de Três Cachoeiras

    expect(await pontos('jiu-jitsu', 'user_ta', TA)).toBe(1);
    expect(await pontos('jiu-jitsu', 'user_ta', TC)).toBe(0);
  });

  it('o ranking da academia soma as modalidades todas', async () => {
    await criarAluno('user_tc', [MMA, JIU], TC);

    agora(SEGUNDA, '20:00');
    await marcar('user_tc', MMA);
    await marcar('user_tc', JIU);

    // A aba "Todas" da tela: tudo o que ele treinou naquela academia.
    const naAcademia = await attendance.getRankingPosition('user_tc', { unit: TC });
    expect(naAcademia?.score).toBe(2);
  });

  it('o recálculo separa as duas academias', async () => {
    await criarAluno('user_tc', [JIU], TC);
    await criarAluno('user_ta', ['terra-de-areia-1-2030-jj'], TA);

    agora(SEGUNDA, '20:00');
    await marcar('user_tc', JIU);
    await marcar('user_ta', 'terra-de-areia-1-2030-jj');

    const result = await adminActions.rebuildModalityRankingsAction();
    expect(result.ok).toBe(true);

    expect(await pontos('jiu-jitsu', 'user_tc', TC)).toBe(1);
    expect(await pontos('jiu-jitsu', 'user_ta', TA)).toBe(1);
    expect(await pontos('jiu-jitsu', 'user_tc', TA)).toBe(0);
  });

  it('o recálculo esvazia a lista que ficou sem ninguém', async () => {
    /*
     * A varredura só reescreve o que contou. Sem apagar antes, a modalidade
     * que perdeu todas as presenças — o professor corrigiu a turma errada —
     * manteria o pódio antigo no ar, e o recálculo deixaria justamente a
     * lista que deveria ter esvaziado.
     */
    await criarAluno('user_tc', [MMA], TC);
    agora(SEGUNDA, '20:00');
    await marcar('user_tc', MMA);

    expect(await pontos('mma', 'user_tc', TC)).toBe(1);

    const desfazer = new FormData();
    desfazer.set('studentId', 'user_tc');
    desfazer.set('classId', MMA);
    await adminActions.undoPresenceAction(desfazer);

    await adminActions.rebuildModalityRankingsAction();

    expect(await pontos('mma', 'user_tc', TC)).toBe(0);
    expect(await attendance.getRanking({ unit: TC, modality: 'mma', limit: 10 })).toEqual([]);
  });
});

describe('o ranking feminino', () => {
  /*
   * São as **alunas** da academia, em tudo o que treinam — e não a turma
   * feminina de terça e quinta.
   *
   * A diferença é a decisão de desenho deste recorte, e é o que estes testes
   * travam. "Ranking feminino" na boca da academia são as mulheres que
   * treinam ali; deixar de fora quem faz a turma mista das 20:30 seria um
   * ranking feminino sem metade das alunas.
   *
   * E a turma feminina não virou modalidade, embora fosse o caminho curto:
   * ela é jiu-jitsu. Promovê-la tiraria aquelas presenças do ranking de
   * Jiu-Jitsu, e as alunas passariam a disputar jiu em duas listas separadas
   * pelo horário em que treinam.
   */

  /** A turma feminina da grade, terça às 19:30. */
  const FEM = 'ter-1930-jj-fem';
  /** A mista de terça, 20:30. */
  const MISTA = 'ter-2030-jj';
  const TERCA = '2026-03-03';

  const fem = async (userId: string, unit = TC) =>
    (await attendance.getRankingPosition(userId, { unit, feminino: true }))?.score ?? 0;

  async function criarAluna(id: string, classIds: readonly string[], unit = TC) {
    const quando = em('2026-02-01', '12:00');
    const pendente = await students.createPendingStudent(
      {
        id,
        name: `Aluna ${id}`,
        email: `${id}@teste.com`,
        phone: '51999990000',
        cpf: '52998224725',
        birthDate: '2000-05-10',
        belt: 'branca',
        gender: 'feminino' as const,
        unit: unit as 'tres-cachoeiras' | 'terra-de-areia',
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

  it('a aluna pontua no feminino, treinando onde treinar', async () => {
    await criarAluna('user_ana', [FEM, MISTA]);
    agora(TERCA, '20:00');

    await marcar('user_ana', FEM);
    await marcar('user_ana', MISTA);

    // As duas presenças contam no feminino: é o ranking das alunas.
    expect(await fem('user_ana')).toBe(2);
  });

  it('a aluna da turma mista entra no feminino', async () => {
    /*
     * O caso que decidiu o desenho. Ela nunca pisa na turma feminina — treina
     * com todo mundo às 20:30 — e é aluna da academia do mesmo jeito. Um
     * ranking feminino sem ela não é um ranking feminino.
     */
    await criarAluna('user_so_mista', [MISTA]);
    agora(TERCA, '21:00');

    await marcar('user_so_mista', MISTA);

    expect(await fem('user_so_mista')).toBe(1);
  });

  it('a turma feminina continua contando no Jiu-Jitsu', async () => {
    /*
     * O que se perderia tratando "feminino" como modalidade: as presenças da
     * turma feminina sairiam do ranking de jiu, e a aluna disputaria jiu em
     * duas listas separadas pelo horário em que treina.
     */
    await criarAluna('user_ana', [FEM]);
    agora(TERCA, '20:00');

    await marcar('user_ana', FEM);

    expect(await pontos('jiu-jitsu', 'user_ana')).toBe(1);
    expect(await fem('user_ana')).toBe(1);
  });

  it('o aluno não entra no feminino', async () => {
    await criarAluno('user_joao', [MISTA]);
    agora(TERCA, '21:00');

    await marcar('user_joao', MISTA);

    expect(await fem('user_joao')).toBe(0);
    expect(await pontos('jiu-jitsu', 'user_joao')).toBe(1);
  });

  it('quem não informou o sexo fica de fora', async () => {
    /*
     * O campo é opcional no cadastro, e quem o deixou em branco o deixou de
     * propósito. Chutar um lado para não deixar a pessoa fora de uma lista
     * seria decidir por ela algo que ela escolheu não dizer.
     */
    const quando = em('2026-02-01', '12:00');
    const pendente = await students.createPendingStudent(
      {
        id: 'user_sem',
        name: 'Sem Informar',
        email: 'sem@teste.com',
        phone: '51999990000',
        cpf: '52998224725',
        birthDate: '2000-05-10',
        belt: 'branca',
        gender: 'nao_informado' as const,
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
      { classIds: [MISTA], belt: 'branca', degree: 0, notes: '' },
      quando,
    );

    agora(TERCA, '21:00');
    await marcar('user_sem', MISTA);

    expect(await fem('user_sem')).toBe(0);
    // Mas no ranking da academia e no de jiu ela conta como qualquer um.
    expect(await pontos('jiu-jitsu', 'user_sem')).toBe(1);
  });

  it('é por academia, como os outros', async () => {
    await criarAluna('user_ana', [MISTA], TC);
    await criarAluna('user_bia', ['terra-de-areia-1-1930-jj-fem'], TA);

    agora('2026-03-02', '20:00');
    await marcar('user_bia', 'terra-de-areia-1-1930-jj-fem');

    agora(TERCA, '21:00');
    await marcar('user_ana', MISTA);

    expect(await fem('user_ana', TC)).toBe(1);
    expect(await fem('user_bia', TA)).toBe(1);
    expect(await fem('user_ana', TA)).toBe(0);
  });

  it('desfazer tira o ponto do feminino também', async () => {
    await criarAluna('user_ana', [MISTA]);
    agora(TERCA, '21:00');
    await marcar('user_ana', MISTA);

    const form = new FormData();
    form.set('studentId', 'user_ana');
    form.set('classId', MISTA);
    expect((await adminActions.undoPresenceAction(form)).ok).toBe(true);

    expect(await fem('user_ana')).toBe(0);
  });

  it('o recálculo reconstrói o feminino', async () => {
    await criarAluna('user_ana', [MISTA]);
    agora(TERCA, '21:00');
    await marcar('user_ana', MISTA);

    const result = await adminActions.rebuildModalityRankingsAction();
    expect(result.ok).toBe(true);

    expect(await fem('user_ana')).toBe(1);
  });

  it('o pódio feminino só tem alunas', async () => {
    await criarAluna('user_ana', [MISTA]);
    await criarAluno('user_joao', [MISTA]);

    agora(TERCA, '21:00');
    await marcar('user_ana', MISTA);
    await marcar('user_joao', MISTA);

    const lista = await attendance.getRanking({ unit: TC, feminino: true, limit: 10 });
    expect(lista.map((row) => row.userId)).toEqual(['user_ana']);

    // E o de jiu tem os dois.
    const jiu = await attendance.getRanking({ unit: TC, modality: 'jiu-jitsu', limit: 10 });
    expect(jiu).toHaveLength(2);
  });
});

describe('a criança que treina com os adultos', () => {
  /*
   * Acontece, e é bom que aconteça: a adolescente que já puxa o treino da
   * noite, o irmão mais novo que fica para a aula seguinte. O que não pode é
   * ela disputar pódio com gente de trinta anos.
   *
   * Então a **lista do ranking sai da categoria do aluno**, não da aula. O
   * treino foi de jiu-jitsu e o registro diz isso — o relatório de frequência
   * da turma dos adultos a mostra lá, que é a verdade do tatame. A disputa é
   * outra conversa, e nela ela está com as outras crianças.
   *
   * O avesso vale igual: o adulto que um professor lança na turma infantil
   * não entra em lista de modalidade nenhuma. Foi o defeito que a academia
   * relatou — um pai em primeiro lugar no ranking Kids.
   */

  const ADULTO = 'seg-2030-jj';
  const KIDS_TURMA = 'seg-1830-kids';
  const NASCIMENTO_CRIANCA = '2018-04-10';

  it('o treino dela no adulto conta no ranking infantil', async () => {
    await criarAluno('user_arthur', [KIDS_TURMA], TC, NASCIMENTO_CRIANCA);
    agora(SEGUNDA, '21:00');

    await marcar('user_arthur', ADULTO);

    expect(await pontos('kids', 'user_arthur')).toBe(1);
    // E não no dos adultos, que é o ponto.
    expect(await pontos('jiu-jitsu', 'user_arthur')).toBe(0);
  });

  it('ela não aparece no pódio dos adultos', async () => {
    await criarAluno('user_arthur', [KIDS_TURMA], TC, NASCIMENTO_CRIANCA);
    await criarAluno('user_grande', [ADULTO]);
    agora(SEGUNDA, '21:00');

    await marcar('user_arthur', ADULTO);
    await marcar('user_grande', ADULTO);

    const adultos = await attendance.getRanking({
      unit: TC,
      modality: 'jiu-jitsu',
      limit: 10,
    });
    expect(adultos.map((row) => row.userId)).toEqual(['user_grande']);

    const infantil = await attendance.getRanking({ unit: TC, modality: 'kids', limit: 10 });
    expect(infantil.map((row) => row.userId)).toEqual(['user_arthur']);
  });

  it('a presença guarda a modalidade da aula, e não a da lista', async () => {
    /*
     * A distinção que torna isto honesto: o registro diz jiu-jitsu, porque
     * foi jiu-jitsu que ela treinou. Só a disputa é que a põe entre as
     * crianças — e o relatório de frequência daquela turma continua achando
     * a presença dela.
     */
    await criarAluno('user_arthur', [KIDS_TURMA], TC, NASCIMENTO_CRIANCA);
    agora(SEGUNDA, '21:00');

    await marcar('user_arthur', ADULTO);

    const registros = await attendance.listCheckins('user_arthur', 5);
    expect(registros[0]?.classId).toBe(ADULTO);
    expect(registros[0]?.modality).toBe('jiu-jitsu');
  });

  it('desfazer tira o ponto do infantil, que é onde ele entrou', async () => {
    await criarAluno('user_arthur', [KIDS_TURMA], TC, NASCIMENTO_CRIANCA);
    agora(SEGUNDA, '21:00');
    await marcar('user_arthur', ADULTO);

    const form = new FormData();
    form.set('studentId', 'user_arthur');
    form.set('classId', ADULTO);
    expect((await adminActions.undoPresenceAction(form)).ok).toBe(true);

    expect(await pontos('kids', 'user_arthur')).toBe(0);
    expect(await pontos('jiu-jitsu', 'user_arthur')).toBe(0);
    expect(await attendance.countCheckins('user_arthur')).toBe(0);
  });

  it('o adulto na turma infantil não entra em modalidade nenhuma', async () => {
    /*
     * O defeito relatado, pelo outro lado. O professor pode lançar — há
     * motivos legítimos, o auxiliar que entrou no treino das crianças —, mas
     * isso não o põe no pódio delas.
     */
    await criarAluno('user_pai', [ADULTO]);
    agora(SEGUNDA, '19:00');

    await marcar('user_pai', KIDS_TURMA);

    expect(await pontos('kids', 'user_pai')).toBe(0);
    expect(await pontos('jiu-jitsu', 'user_pai')).toBe(0);

    // Mas o treino aconteceu: conta no ranking da academia.
    expect((await attendance.getRankingPosition('user_pai', { unit: TC }))?.score).toBe(1);
  });

  it('o recálculo aplica a mesma regra ao histórico', async () => {
    await criarAluno('user_arthur', [KIDS_TURMA], TC, NASCIMENTO_CRIANCA);
    agora(SEGUNDA, '21:00');
    await marcar('user_arthur', ADULTO);

    const result = await adminActions.rebuildModalityRankingsAction();
    expect(result.ok).toBe(true);

    expect(await pontos('kids', 'user_arthur')).toBe(1);
    expect(await pontos('jiu-jitsu', 'user_arthur')).toBe(0);
  });
});
