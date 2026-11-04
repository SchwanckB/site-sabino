import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { can, isStaff, type Permission } from '@/lib/roles';

import { UpstashMock } from './upstashMock';

/**
 * Exclusão definitiva do cadastro.
 *
 * É a única operação do app sem desfazer, então os testes cobrem tanto o
 * caminho feliz quanto as recusas — e principalmente a ordem das coisas: o que
 * acontece quando o Clerk ou o Blob falham no meio.
 */

const mock = new UpstashMock();

const professor = {
  id: 'user_admin',
  email: 'admin@teste.com',
  name: 'Professor Sabino',
  role: 'GESTAO' as const,
  imageUrl: null,
};
const alunoSessao = { ...professor, id: 'user_pedro', role: 'ALUNO' as const };

let atual: typeof professor | typeof alunoSessao = professor;
let clerkFalha = false;
let clerkAchou = true;
let blobFalha = false;
const clerkApagados: string[] = [];
const blobsApagados: string[] = [];

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

vi.mock('@/lib/repositories/accounts', () => ({
  deleteAccount: async (id: string) => {
    if (clerkFalha) throw new Error('Clerk indisponível');
    if (!clerkAchou) return false;
    clerkApagados.push(id);
    return true;
  },
  setAccountRole: async () => ({ ok: true, message: '' }),
  listAccounts: async () => [],
}));

vi.mock('@/lib/repositories/documents', () => ({
  uploadDocument: async () => ({ ok: true, blobKey: 'documentos/user_pedro/doc.jpg' }),
  validateDocument: () => null,
  resolveDocumentUrl: async () => null,
  openDocument: async () => null,
  deleteDocument: async (key: string) => {
    if (blobFalha) throw new Error('Blob indisponível');
    blobsApagados.push(key);
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  unstable_cache: <T,>(fn: T): T => fn,
}));

let students: typeof import('@/lib/repositories/students');
let payments: typeof import('@/lib/repositories/payments');
let attendance: typeof import('@/lib/repositories/attendance');
let audit: typeof import('@/lib/repositories/audit');
let adminActions: typeof import('@/app/admin/actions');

beforeAll(async () => {
  const { url, token } = await mock.start();
  process.env['UPSTASH_REDIS_REST_URL'] = url;
  process.env['UPSTASH_REDIS_REST_TOKEN'] = token;

  students = await import('@/lib/repositories/students');
  payments = await import('@/lib/repositories/payments');
  attendance = await import('@/lib/repositories/attendance');
  audit = await import('@/lib/repositories/audit');
  adminActions = await import('@/app/admin/actions');
});

afterAll(async () => {
  await mock.stop();
});

beforeEach(() => {
  mock.reset();
  atual = professor;
  clerkFalha = false;
  clerkAchou = true;
  blobFalha = false;
  clerkApagados.length = 0;
  blobsApagados.length = 0;
});

const agora = new Date('2026-03-10T12:00:00Z');

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  return f;
}

/** Aluno ativo com mensalidade, presença e anexo — tudo que a exclusão varre. */
async function alunoCompleto() {
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
      docBlobKey: 'documentos/user_pedro/doc.jpg',
      consentVersion: 'lgpd-2026-01',
      consentAt: agora.toISOString(),
    },
    agora,
  );

  const ficha = (await students.getStudent('user_pedro'))!;
  await students.approveStudent(
    ficha,
    { classIds: [], belt: 'branca', degree: 0, notes: '' },
    agora,
  );
  await payments.setupPaymentPlan(
    { userId: 'user_pedro', planId: 'mensal', amountCents: 15000, dueDay: 10, graceDays: 4 },
    agora,
  );
  await attendance.recordCheckin(
    {
      student: (await students.getStudent('user_pedro'))!,
      classId: null,
      classTitle: null,
      source: 'manual',
      registeredBy: 'user_admin',
    },
    agora,
  );

  return (await students.getStudent('user_pedro'))!;
}

describe('apagar cadastro', () => {
  it('remove ficha, mensalidade, presenças e ranking', async () => {
    await alunoCompleto();
    expect(await students.getStudent('user_pedro')).not.toBeNull();

    const result = await adminActions.deleteStudentAction(
      form({ studentId: 'user_pedro', confirmName: 'Pedro Pulli' }),
    );

    expect(result.ok).toBe(true);
    expect(await students.getStudent('user_pedro')).toBeNull();
    expect(await payments.getPaymentPlan('user_pedro')).toBeNull();
    expect(await attendance.listCheckins('user_pedro')).toHaveLength(0);
    expect(await attendance.getRankingPosition('user_pedro')).toBeNull();
  });

  it('some das listagens do admin', async () => {
    await alunoCompleto();

    await adminActions.deleteStudentAction(
      form({ studentId: 'user_pedro', confirmName: 'Pedro Pulli' }),
    );

    expect(await students.listAllStudents()).toHaveLength(0);
    expect(await students.listStudentsByStatus('ativo')).toHaveLength(0);
  });

  it('apaga o arquivo anexado e a conta de login', async () => {
    await alunoCompleto();

    const result = await adminActions.deleteStudentAction(
      form({ studentId: 'user_pedro', confirmName: 'Pedro Pulli' }),
    );

    expect(blobsApagados).toContain('documentos/user_pedro/doc.jpg');
    expect(clerkApagados).toContain('user_pedro');
    expect(result.message).toContain('inclusive o login');
  });

  it('registra na auditoria quem apagou, antes de apagar', async () => {
    await alunoCompleto();

    await adminActions.deleteStudentAction(
      form({ studentId: 'user_pedro', confirmName: 'Pedro Pulli' }),
    );

    const entrada = (await audit.listAudit()).find((e) => e.action === 'aluno.apagado');
    expect(entrada).toBeDefined();
    expect(entrada?.byName).toBe('Professor Sabino');
    // O nome tem de estar na trilha: depois de apagar não há de onde tirar.
    expect(entrada?.targetName).toBe('Pedro Pulli');
    expect(entrada?.detail).toContain('pedro@teste.com');
  });
});

describe('o nome digitado tem de bater', () => {
  it('recusa quando o nome está errado', async () => {
    await alunoCompleto();

    const result = await adminActions.deleteStudentAction(
      form({ studentId: 'user_pedro', confirmName: 'Pedro' }),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain('digite o nome exatamente');
    // Nada foi tocado.
    expect(await students.getStudent('user_pedro')).not.toBeNull();
    expect(clerkApagados).toHaveLength(0);
    expect(blobsApagados).toHaveLength(0);
  });

  it('recusa confirmação vazia', async () => {
    await alunoCompleto();

    const result = await adminActions.deleteStudentAction(form({ studentId: 'user_pedro' }));

    expect(result.ok).toBe(false);
    expect(await students.getStudent('user_pedro')).not.toBeNull();
  });

  it('aceita diferença de maiúsculas e espaços nas pontas', async () => {
    await alunoCompleto();

    const result = await adminActions.deleteStudentAction(
      form({ studentId: 'user_pedro', confirmName: '  pedro pulli  ' }),
    );

    expect(result.ok).toBe(true);
  });
});

describe('autorização e casos de borda', () => {
  it('aluno comum não consegue apagar ninguém', async () => {
    await alunoCompleto();
    atual = alunoSessao;

    await expect(
      adminActions.deleteStudentAction(
        form({ studentId: 'user_pedro', confirmName: 'Pedro Pulli' }),
      ),
    ).rejects.toThrow();

    atual = professor;
    expect(await students.getStudent('user_pedro')).not.toBeNull();
  });

  it('aluno inexistente devolve recusa, não estouro', async () => {
    const result = await adminActions.deleteStudentAction(
      form({ studentId: 'nao-existe', confirmName: 'Qualquer' }),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Aluno não encontrado.');
  });
});

describe('falhas parciais são relatadas com honestidade', () => {
  it('Clerk fora do ar: os dados somem e a mensagem avisa do login', async () => {
    await alunoCompleto();
    clerkFalha = true;

    const result = await adminActions.deleteStudentAction(
      form({ studentId: 'user_pedro', confirmName: 'Pedro Pulli' }),
    );

    // A ficha foi apagada, então não pode dizer que falhou tudo...
    expect(result.ok).toBe(true);
    expect(await students.getStudent('user_pedro')).toBeNull();
    // ...mas também não pode afirmar que o login foi embora.
    expect(result.message).not.toContain('inclusive o login');
    expect(result.message).toContain('não pôde ser removida');
  });

  it('conta já inexistente no Clerk não vira erro', async () => {
    await alunoCompleto();
    clerkAchou = false;

    const result = await adminActions.deleteStudentAction(
      form({ studentId: 'user_pedro', confirmName: 'Pedro Pulli' }),
    );

    expect(result.ok).toBe(true);
    expect(await students.getStudent('user_pedro')).toBeNull();
  });

  it('Blob fora do ar não impede o resto da exclusão', async () => {
    await alunoCompleto();
    blobFalha = true;

    const result = await adminActions.deleteStudentAction(
      form({ studentId: 'user_pedro', confirmName: 'Pedro Pulli' }),
    );

    expect(result.ok).toBe(true);
    expect(await students.getStudent('user_pedro')).toBeNull();
    expect(clerkApagados).toContain('user_pedro');
  });
});
