import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { can, isStaff, type Permission } from '@/lib/roles';

import { UpstashMock } from './upstashMock';

/**
 * Aula personalizada, de ponta a ponta.
 *
 * O caminho que o professor percorre de fato: ele abre a tela de horários,
 * marca que **hoje** o MMA é mais cedo, e o aluno chega na academia e consegue
 * bater presença no horário novo. A lógica pura já está coberta em
 * `utils/classOverrides.test.ts`; o que se prova aqui é a ligação — gravação
 * no Redis, leitura sem cache e a server action do check-in reconferindo a
 * turma escolhida.
 *
 * O relógio é congelado com `toFake: ['Date']` porque as actions leem
 * `new Date()` por dentro: sem isso não haveria como testar "uma hora antes do
 * horário personalizado". Só o `Date` é falsificado — `setTimeout` continua
 * real, senão o mock REST do Upstash não responderia.
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

let atual: typeof aluno | typeof professor = aluno;

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
      : { ok: false, message: 'Isso é da gestão. Peça para quem administra a academia.' };
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
let painel: typeof import('@/app/painel/actions');
let students: typeof import('@/lib/repositories/students');
let attendance: typeof import('@/lib/repositories/attendance');
let overrides: typeof import('@/lib/repositories/classOverrides');
let qr: typeof import('@/lib/repositories/qr');
let schedule: typeof import('@/lib/schedule');

beforeAll(async () => {
  const { url, token } = await mock.start();
  process.env['UPSTASH_REDIS_REST_URL'] = url;
  process.env['UPSTASH_REDIS_REST_TOKEN'] = token;
  process.env['QR_TOKEN_SECRET'] = 'segredo-de-teste-com-tamanho-suficiente';

  adminActions = await import('@/app/admin/actions');
  painel = await import('@/app/painel/actions');
  students = await import('@/lib/repositories/students');
  attendance = await import('@/lib/repositories/attendance');
  overrides = await import('@/lib/repositories/classOverrides');
  qr = await import('@/lib/repositories/qr');
  schedule = await import('@/lib/schedule');
});

afterAll(async () => {
  await mock.stop();
});

beforeEach(() => {
  mock.reset();
  atual = aluno;
});

afterEach(() => {
  vi.useRealTimers();
});

/** Segunda-feira. Na grade do seed, MMA das 19:30 às 20:30. */
const SEGUNDA = '2026-03-02';
const OUTRA_SEGUNDA = '2026-03-09';

const em = (date: string, time: string): Date => new Date(`${date}T${time}:00-03:00`);

/** Congela o relógio — as actions leem `new Date()` por dentro. */
function agora(date: string, time: string): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(em(date, time));
}

const fichaBase = {
  id: aluno.id,
  name: 'Aluno de Teste',
  email: 'aluno@teste.com',
  phone: '51999998888',
  cpf: '52998224725',
  birthDate: '1995-04-20',
  gender: 'masculino' as const,
  belt: 'branca',
  guardianName: null,
  guardianPhone: null,
  guardianCpf: null,
  docBlobKey: null,
  consentVersion: 'lgpd-2026-01',
  consentAt: '2026-02-01T12:00:00.000Z',
};

async function alunoDeMma() {
  const matricula = em('2026-02-01', '12:00');
  const pendente = await students.createPendingStudent(fichaBase, matricula);
  return students.approveStudent(
    pendente,
    { classIds: ['seg-1930-mma'], belt: 'branca', degree: 0, notes: '' },
    matricula,
  );
}

/** Grava a exceção pela action do admin, como o professor faria na tela. */
async function marcarMaisCedo(date: string, start = '18:30', end = '19:30') {
  atual = professor;
  const form = new FormData();
  form.set('classId', 'seg-1930-mma');
  form.set('date', date);
  form.set('startTime', start);
  form.set('endTime', end);
  form.set('note', 'Hoje mais cedo');

  const result = await adminActions.saveClassOverrideAction(form);
  atual = aluno;
  return result;
}

/** Cancela a aula do dia — sem informar horário nenhum. */
async function cancelar(date: string) {
  atual = professor;
  const form = new FormData();
  form.set('classId', 'seg-1930-mma');
  form.set('date', date);
  form.set('canceled', 'on');
  form.set('note', 'Professor viajando');

  const result = await adminActions.saveClassOverrideAction(form);
  atual = aluno;
  return result;
}

describe('o professor cancela a aula do dia', () => {
  it('não precisa digitar horário: vem da grade', async () => {
    agora(SEGUNDA, '10:00');

    const result = await cancelar(SEGUNDA);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('cancelada');

    const gravadas = await overrides.listUpcomingClassOverrides(em(SEGUNDA, '10:00'));
    expect(gravadas[0]?.canceled).toBe(true);
    // O horário que a turma teria, para o registro descrever o que caiu.
    expect(gravadas[0]?.startTime).toBe('19:30');
    expect(gravadas[0]?.endTime).toBe('20:30');
  });

  it('recusa turma que não existe na grade', async () => {
    agora(SEGUNDA, '10:00');
    atual = professor;

    const form = new FormData();
    form.set('classId', 'turma-inventada');
    form.set('date', SEGUNDA);
    form.set('canceled', 'on');
    form.set('note', '');

    const result = await adminActions.saveClassOverrideAction(form);
    atual = aluno;

    expect(result.ok).toBe(false);
    expect(result.message).toContain('não encontrada');
  });

  it('fecha o check-in o dia inteiro', async () => {
    await alunoDeMma();

    agora(SEGUNDA, '10:00');
    await cancelar(SEGUNDA);

    const token = qr.getCurrentQrToken('tres-cachoeiras').token;

    // Nem cedo, nem na hora da aula.
    agora(SEGUNDA, '18:45');
    const cedo = await painel.listCheckinOptions(token);
    expect(cedo.ok === true && cedo.classes).toEqual([]);

    agora(SEGUNDA, '19:45');
    const naHora = await painel.listCheckinOptions(token);
    expect(naHora.ok === true && naHora.classes).toEqual([]);

    const result = await painel.checkinAction(token, ['seg-1930-mma']);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('sem_aula_agora');
  });

  it('a semana seguinte continua valendo', async () => {
    await alunoDeMma();

    agora(SEGUNDA, '10:00');
    await cancelar(SEGUNDA);

    agora(OUTRA_SEGUNDA, '19:45');
    const token = qr.getCurrentQrToken('tres-cachoeiras').token;
    const opcoes = await painel.listCheckinOptions(token);

    expect(opcoes.ok === true && opcoes.classes.map((item) => item.time)).toEqual(['19:30']);
  });

  it('cancelar substitui um horário remarcado do mesmo dia', async () => {
    agora(SEGUNDA, '10:00');
    await marcarMaisCedo(SEGUNDA);
    await cancelar(SEGUNDA);

    const gravadas = await overrides.listUpcomingClassOverrides(em(SEGUNDA, '10:00'));
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0]?.canceled).toBe(true);
  });

  it('desfazer o cancelamento devolve a aula no mesmo dia', async () => {
    await alunoDeMma();

    agora(SEGUNDA, '10:00');
    await cancelar(SEGUNDA);

    atual = professor;
    const gravadas = await overrides.listUpcomingClassOverrides(em(SEGUNDA, '10:00'));
    const form = new FormData();
    form.set('id', gravadas[0]?.id ?? '');
    expect((await adminActions.deleteClassOverrideAction(form)).ok).toBe(true);
    atual = aluno;

    agora(SEGUNDA, '19:45');
    const token = qr.getCurrentQrToken('tres-cachoeiras').token;
    const opcoes = await painel.listCheckinOptions(token);

    expect(opcoes.ok === true && opcoes.classes.map((item) => item.time)).toEqual(['19:30']);
  });
});

describe('o professor marca a aula personalizada', () => {
  it('grava e descreve o novo horário na mensagem', async () => {
    agora(SEGUNDA, '10:00');

    const result = await marcarMaisCedo(SEGUNDA);

    expect(result.ok).toBe(true);
    expect(result.message).toContain('02/03/2026');
    expect(result.message).toContain('18:30');

    const gravadas = await overrides.listUpcomingClassOverrides(em(SEGUNDA, '10:00'));
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0]?.classId).toBe('seg-1930-mma');
    expect(gravadas[0]?.note).toBe('Hoje mais cedo');
  });

  it('não altera a grade da academia', async () => {
    agora(SEGUNDA, '10:00');
    await marcarMaisCedo(SEGUNDA);

    // A landing page e a tela de horários leem esta grade: o horário normal
    // tem de continuar 19:30. Era o pedido literal.
    const grade = await schedule.getScheduleFresh();
    const mma = grade.classes.find((slot) => slot.id === 'seg-1930-mma');

    expect(mma?.startTime).toBe('19:30');
    expect(mma?.onlyOnDate).toBeUndefined();
  });

  it('recusa data que já passou', async () => {
    agora(OUTRA_SEGUNDA, '10:00');

    const result = await marcarMaisCedo(SEGUNDA);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('já passou');
  });

  it('recusa fim antes do início', async () => {
    agora(SEGUNDA, '10:00');

    const result = await marcarMaisCedo(SEGUNDA, '18:30', '17:30');

    expect(result.ok).toBe(false);
  });

  it('salvar de novo no mesmo dia corrige em vez de duplicar', async () => {
    agora(SEGUNDA, '10:00');
    await marcarMaisCedo(SEGUNDA, '18:30');
    await marcarMaisCedo(SEGUNDA, '18:00');

    const gravadas = await overrides.listUpcomingClassOverrides(em(SEGUNDA, '10:00'));
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0]?.startTime).toBe('18:00');
  });

  it('exige sessão de professor', async () => {
    agora(SEGUNDA, '10:00');

    const form = new FormData();
    form.set('classId', 'seg-1930-mma');
    form.set('date', SEGUNDA);
    form.set('startTime', '18:30');
    form.set('endTime', '19:30');
    form.set('note', '');

    // `atual` continua sendo o aluno.
    await expect(adminActions.saveClassOverrideAction(form)).rejects.toThrow();
  });
});

describe('o aluno bate presença no horário personalizado', () => {
  it('abre uma hora antes, e a presença entra na turma de verdade', async () => {
    const ficha = await alunoDeMma();
    expect(ficha.classIds).toEqual(['seg-1930-mma']);

    agora(SEGUNDA, '10:00');
    expect((await marcarMaisCedo(SEGUNDA)).ok).toBe(true);

    // 17:30 — uma hora antes das 18:30. No horário normal não haveria janela
    // nenhuma: o MMA das 19:30 só abriria às 18:30.
    agora(SEGUNDA, '17:30');
    const token = qr.getCurrentQrToken('tres-cachoeiras').token;

    const opcoes = await painel.listCheckinOptions(token);
    expect(opcoes.ok).toBe(true);
    expect(opcoes.ok === true && opcoes.classes.map((item) => item.time)).toEqual(['18:30']);

    const result = await painel.checkinAction(token, ['seg-1930-mma']);
    expect(result.ok).toBe(true);

    // O ponto da coisa: é presença na turma, não um registro paralelo. Conta
    // no total, no ranking e no histórico como qualquer outro treino.
    expect(await attendance.countCheckins(aluno.id)).toBe(1);

    const historico = await attendance.listCheckins(aluno.id, 5);
    expect(historico[0]?.classId).toBe('seg-1930-mma');
    expect(historico[0]?.classTitle).toBe('MMA');
    expect(historico[0]?.date).toBe(SEGUNDA);
    expect(historico[0]?.source).toBe('qr');

    const ranking = await attendance.getRanking({});
    expect(ranking).toEqual([{ userId: aluno.id, score: 1, position: 1 }]);
  });

  it('o horário normal do dia remarcado não aceita mais presença', async () => {
    await alunoDeMma();

    agora(SEGUNDA, '10:00');
    await marcarMaisCedo(SEGUNDA);

    /*
     * 20:00 cairia no meio do MMA das 19:30 — que hoje não acontece. O que
     * está aberto é a tolerância da aula antecipada das 18:30, e é nela que a
     * presença entra: o aluno treinou às 18:30 e está marcando depois.
     */
    agora(SEGUNDA, '20:00');
    const token = qr.getCurrentQrToken('tres-cachoeiras').token;

    const opcoes = await painel.listCheckinOptions(token);
    expect(opcoes.ok === true && opcoes.classes.map((item) => item.time)).toEqual(['18:30']);

    /*
     * 21:00 é a prova de que o horário normal foi mesmo furado: a janela da
     * aula antecipada fechou às 20:30, e a das 19:30 iria até 21:30.
     */
    agora(SEGUNDA, '21:00');
    const tarde = await painel.listCheckinOptions(token);
    expect(tarde.ok === true && tarde.classes).toEqual([]);

    const result = await painel.checkinAction(token, ['seg-1930-mma']);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('sem_aula_agora');
  });

  it('na semana seguinte a turma está de volta no horário normal', async () => {
    await alunoDeMma();

    agora(SEGUNDA, '10:00');
    await marcarMaisCedo(SEGUNDA);

    // Mesma turma, segunda seguinte: 17:30 não abre nada…
    agora(OUTRA_SEGUNDA, '17:30');
    const token = qr.getCurrentQrToken('tres-cachoeiras').token;
    expect((await painel.listCheckinOptions(token)).ok === true).toBe(true);
    const cedo = await painel.listCheckinOptions(token);
    expect(cedo.ok === true && cedo.classes).toEqual([]);

    // …e 19:40 abre, no horário da grade.
    agora(OUTRA_SEGUNDA, '19:40');
    const normal = await painel.listCheckinOptions(token);
    expect(normal.ok === true && normal.classes.map((item) => item.time)).toEqual(['19:30']);
  });

  it('remover a exceção devolve o horário normal no mesmo dia', async () => {
    await alunoDeMma();

    agora(SEGUNDA, '10:00');
    await marcarMaisCedo(SEGUNDA);

    atual = professor;
    const gravadas = await overrides.listUpcomingClassOverrides(em(SEGUNDA, '10:00'));
    const form = new FormData();
    form.set('id', gravadas[0]?.id ?? '');
    expect((await adminActions.deleteClassOverrideAction(form)).ok).toBe(true);
    atual = aluno;

    agora(SEGUNDA, '19:40');
    const token = qr.getCurrentQrToken('tres-cachoeiras').token;
    const opcoes = await painel.listCheckinOptions(token);

    expect(opcoes.ok === true && opcoes.classes.map((item) => item.time)).toEqual(['19:30']);
  });
});
