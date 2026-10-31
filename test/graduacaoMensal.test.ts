import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { UpstashMock } from './upstashMock';

/**
 * "Gradua todo mês" precisa poder ser desligado.
 *
 * Caso real: o professor abria a ficha do aluno, desmarcava a opção, salvava,
 * lia "Dados atualizados" — e no recarregamento o aluno voltava marcado.
 *
 * A causa não era o botão: `updateStudent` montava o hash do Redis tratando
 * `classIds`, nulo, string e número, e **booleano não casava com nenhum ramo**.
 * O campo era descartado em silêncio e o valor antigo permanecia no banco. Como
 * `graduatesMonthly` é o único booleano da ficha, o defeito só aparecia aqui —
 * mas valia para qualquer booleano que viesse a ser adicionado.
 */

const mock = new UpstashMock();

const admin = {
  id: 'user_admin',
  email: 'admin@teste.com',
  name: 'Professor',
  role: 'ADMIN' as const,
  imageUrl: null,
};

vi.mock('@/lib/auth', () => ({
  requireUser: async () => admin,
  requireAdmin: async () => admin,
  getSessionUser: async () => admin,
  isAdminEmail: () => false,
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  unstable_cache: <T,>(fn: T): T => fn,
}));

let students: typeof import('@/lib/repositories/students');
let adminActions: typeof import('@/app/admin/actions');

beforeAll(async () => {
  const { url, token } = await mock.start();
  process.env['UPSTASH_REDIS_REST_URL'] = url;
  process.env['UPSTASH_REDIS_REST_TOKEN'] = token;

  students = await import('@/lib/repositories/students');
  adminActions = await import('@/app/admin/actions');
});

afterAll(async () => {
  await mock.stop();
});

beforeEach(() => {
  mock.reset();
});

const agora = new Date('2026-03-10T12:00:00Z');

/** Cria um aluno infantil ativo — a trilha onde a graduação mensal vale. */
async function pedroPulli() {
  await students.createPendingStudent(
    {
      id: 'user_pedro',
      name: 'Pedro Pulli',
      email: 'pedro@teste.com',
      phone: '51999998888',
      cpf: '52998224725',
      birthDate: '2016-04-20',
      gender: 'masculino',
      unit: 'tres-cachoeiras',
      belt: 'branca',
      guardianName: 'Responsável',
      guardianPhone: '51988887777',
      guardianCpf: null,
      docBlobKey: null,
      consentVersion: 'lgpd-2026-01',
      consentAt: agora.toISOString(),
    },
    agora,
  );

  const ficha = await students.getStudent('user_pedro');
  if (!ficha) throw new Error('ficha não criada');

  await students.approveStudent(
    ficha,
    { classIds: [], belt: 'branca', degree: 0, notes: '' },
    agora,
  );

  return (await students.getStudent('user_pedro'))!;
}

function formulario(campos: Record<string, string>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(campos)) form.append(k, v);
  return form;
}

describe('desligar a graduação mensal', () => {
  it('nasce ligada na aprovação', async () => {
    const ficha = await pedroPulli();
    expect(ficha.graduatesMonthly).toBe(true);
  });

  it('desmarcar e salvar realmente desliga', async () => {
    await pedroPulli();

    // Checkbox desmarcada: o navegador simplesmente não envia o campo.
    const result = await adminActions.updateStudentAction(
      formulario({ studentId: 'user_pedro', belt: 'branca', degree: '0' }),
    );

    expect(result.ok).toBe(true);

    // Antes: voltava `true`, porque o booleano era descartado na gravação.
    expect((await students.getStudent('user_pedro'))?.graduatesMonthly).toBe(false);
  });

  it('continua desligada depois de outra edição qualquer', async () => {
    await pedroPulli();

    await adminActions.updateStudentAction(
      formulario({ studentId: 'user_pedro', belt: 'branca', degree: '0' }),
    );
    // Uma segunda edição, também sem a checkbox.
    await adminActions.updateStudentAction(
      formulario({ studentId: 'user_pedro', belt: 'cinza-branca', degree: '0' }),
    );

    const ficha = await students.getStudent('user_pedro');
    expect(ficha?.graduatesMonthly).toBe(false);
    expect(ficha?.belt).toBe('cinza-branca');
  });

  it('marcar de volta liga outra vez', async () => {
    await pedroPulli();

    await adminActions.updateStudentAction(
      formulario({ studentId: 'user_pedro', belt: 'branca', degree: '0' }),
    );
    expect((await students.getStudent('user_pedro'))?.graduatesMonthly).toBe(false);

    await adminActions.updateStudentAction(
      formulario({ studentId: 'user_pedro', belt: 'branca', degree: '0', graduatesMonthly: 'on' }),
    );

    expect((await students.getStudent('user_pedro'))?.graduatesMonthly).toBe(true);
  });
});

describe('updateStudent grava booleano', () => {
  it('false chega ao banco', async () => {
    await pedroPulli();

    await students.updateStudent('user_pedro', { graduatesMonthly: false }, agora);
    expect((await students.getStudent('user_pedro'))?.graduatesMonthly).toBe(false);
  });

  it('true chega ao banco', async () => {
    await pedroPulli();

    await students.updateStudent('user_pedro', { graduatesMonthly: false }, agora);
    await students.updateStudent('user_pedro', { graduatesMonthly: true }, agora);
    expect((await students.getStudent('user_pedro'))?.graduatesMonthly).toBe(true);
  });

  it('não atropela os outros campos da ficha', async () => {
    await pedroPulli();

    await students.updateStudent('user_pedro', { graduatesMonthly: false }, agora);

    const ficha = await students.getStudent('user_pedro');
    expect(ficha?.name).toBe('Pedro Pulli');
    expect(ficha?.status).toBe('ativo');
    expect(ficha?.belt).toBe('branca');
  });
});
