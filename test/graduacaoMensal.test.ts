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

/**
 * Nome, matrícula e última graduação passaram a ser editáveis pelo professor.
 *
 * As duas datas não são campos quaisquer: são a âncora de `graduation:due`, o
 * índice que diz em que dia o próximo grau libera. Corrigi-las sem reindexar
 * deixaria a agenda apontando para a data antiga — e nada na tela denunciaria
 * a diferença, porque a ficha mostraria a data nova.
 */
describe('corrigir nome e as datas de âncora', () => {
  it('corrige o nome do aluno', async () => {
    await pedroPulli();

    const result = await adminActions.updateStudentAction(
      formulario({
        studentId: 'user_pedro',
        name: 'Pedro Henrique Pulli',
        belt: 'branca',
        degree: '0',
      }),
    );

    expect(result.ok).toBe(true);
    expect((await students.getStudent('user_pedro'))?.name).toBe('Pedro Henrique Pulli');
  });

  it('recusa nome curto em vez de gravar lixo', async () => {
    await pedroPulli();

    const result = await adminActions.updateStudentAction(
      formulario({ studentId: 'user_pedro', name: 'P', belt: 'branca', degree: '0' }),
    );

    expect(result.ok).toBe(false);
    expect((await students.getStudent('user_pedro'))?.name).toBe('Pedro Pulli');
  });

  it('nome em branco mantém o atual', async () => {
    await pedroPulli();

    await adminActions.updateStudentAction(
      formulario({ studentId: 'user_pedro', name: '', belt: 'branca', degree: '0' }),
    );

    expect((await students.getStudent('user_pedro'))?.name).toBe('Pedro Pulli');
  });

  it('corrige a matrícula e recalcula a agenda de graduação', async () => {
    await pedroPulli();

    // Aprovado hoje (10/03), o próximo grau sairia em 09/04 — longe da
    // janela de hoje. Com a matrícula corrigida para 40 dias atrás, ele
    // passa a estar elegível agora.
    const result = await adminActions.updateStudentAction(
      formulario({
        studentId: 'user_pedro',
        joinedAt: '2026-01-29',
        belt: 'branca',
        degree: '0',
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.message).toContain('agenda de graduação');

    const ficha = await students.getStudent('user_pedro');
    expect(ficha?.joinedAt?.slice(0, 10)).toBe('2026-01-29');

    // A prova de que o índice foi reescrito, e não só o campo da ficha.
    expect(await students.listGraduationDueIds(agora)).toContain('user_pedro');
  });

  it('corrige a última graduação, que manda na agenda', async () => {
    await pedroPulli();

    await adminActions.updateStudentAction(
      formulario({
        studentId: 'user_pedro',
        joinedAt: '2026-01-29',
        lastGraduationAtPresent: 'on',
        // Graduou há dez dias: a espera recomeça, e sai da fila de hoje.
        lastGraduationAt: '2026-02-28',
        belt: 'branca',
        degree: '0',
      }),
    );

    const ficha = await students.getStudent('user_pedro');
    expect(ficha?.lastGraduationAt?.slice(0, 10)).toBe('2026-02-28');
    expect(await students.listGraduationDueIds(agora)).not.toContain('user_pedro');
  });

  it('apagar a última graduação volta a contar desde a matrícula', async () => {
    await pedroPulli();

    await adminActions.updateStudentAction(
      formulario({
        studentId: 'user_pedro',
        joinedAt: '2026-01-29',
        lastGraduationAtPresent: 'on',
        lastGraduationAt: '2026-02-28',
        belt: 'branca',
        degree: '0',
      }),
    );

    // Campo enviado vazio: é assim que se desfaz um valor posto por engano.
    await adminActions.updateStudentAction(
      formulario({
        studentId: 'user_pedro',
        lastGraduationAtPresent: 'on',
        lastGraduationAt: '',
        belt: 'branca',
        degree: '0',
      }),
    );

    const ficha = await students.getStudent('user_pedro');
    expect(ficha?.lastGraduationAt).toBeNull();
    // Voltou a contar da matrícula de 29/01, logo está elegível de novo.
    expect(await students.listGraduationDueIds(agora)).toContain('user_pedro');
  });

  it('recusa data no futuro', async () => {
    await pedroPulli();

    const futuro = await adminActions.updateStudentAction(
      formulario({ studentId: 'user_pedro', joinedAt: '2027-01-01', belt: 'branca', degree: '0' }),
    );

    expect(futuro.ok).toBe(false);
    expect(futuro.message).toContain('futuro');
  });

  it('recusa matrícula anterior ao nascimento', async () => {
    await pedroPulli();

    const result = await adminActions.updateStudentAction(
      formulario({ studentId: 'user_pedro', joinedAt: '2010-01-01', belt: 'branca', degree: '0' }),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain('nascimento');
  });

  it('recusa graduação anterior à matrícula', async () => {
    await pedroPulli();

    const result = await adminActions.updateStudentAction(
      formulario({
        studentId: 'user_pedro',
        joinedAt: '2026-02-01',
        lastGraduationAtPresent: 'on',
        lastGraduationAt: '2026-01-01',
        belt: 'branca',
        degree: '0',
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain('anterior à matrícula');
  });
});
