import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { UpstashMock } from './upstashMock';

/**
 * A plaquinha NFC do balcão.
 *
 * O aluno encosta o celular e a presença entra — sem abrir app, sem tocar em
 * botão, sem esperar tela. Uma etiqueta NFC passiva só sabe entregar uma URL,
 * então a gravação acontece na própria abertura dela: `GET /presenca/<codigo>`.
 *
 * Rota `GET` que muta é coisa que se faz com cuidado, e o cuidado é o que
 * este arquivo trava:
 *
 *   - encostar grava, e a confirmação é redirecionamento, não erro;
 *   - encostar dez vezes dá **uma** presença (a trava é `SET NX`);
 *   - fora da janela da aula não grava nada;
 *   - sem sessão de aluno não grava nada;
 *   - duas turmas do aluno no horário não gravam sozinhas: a pergunta "vai
 *     ficar para a seguinte?" tem de ser feita, e a plaquinha manda para a
 *     tela de check-in;
 *   - o código da plaquinha é o mesmo do cartaz, e o de uma unidade não serve
 *     na outra.
 */

const mock = new UpstashMock();

const aluno = {
  id: 'user_aluno',
  email: 'aluno@teste.com',
  name: 'Aluno de Teste',
  role: 'ALUNO' as const,
  imageUrl: null,
};

type Sessao = typeof aluno | null;
let atual: Sessao = aluno;

vi.mock('@/lib/auth', () => ({
  requireUser: async () => {
    if (!atual) throw new Error('REDIRECT /entrar');
    return atual;
  },
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
  updateTag: () => undefined,
  unstable_cache: <T,>(fn: T): T => fn,
}));

let rota: typeof import('@/app/presenca/[token]/route');
let students: typeof import('@/lib/repositories/students');
let attendance: typeof import('@/lib/repositories/attendance');
let qr: typeof import('@/lib/repositories/qr');

beforeAll(async () => {
  const { url, token } = await mock.start();
  process.env['UPSTASH_REDIS_REST_URL'] = url;
  process.env['UPSTASH_REDIS_REST_TOKEN'] = token;
  process.env['QR_TOKEN_SECRET'] = 'segredo-de-teste-com-tamanho-suficiente';

  rota = await import('@/app/presenca/[token]/route');
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
  atual = aluno;
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

const BASE = 'https://sabino.test';

/** Encosta o celular na plaquinha: abre a URL da etiqueta. */
async function encostar(token: string) {
  return rota.GET(new Request(`${BASE}/presenca/${token}`), {
    params: Promise.resolve({ token }),
  });
}

/** O destino do redirecionamento, sem o domínio. */
function destino(response: { headers: Headers }): string {
  const location = response.headers.get('location') ?? '';
  return location.replace(BASE, '');
}

async function matricular(
  classIds: readonly string[],
  unit: 'tres-cachoeiras' | 'terra-de-areia' = 'tres-cachoeiras',
) {
  const quando = em('2026-02-01', '12:00');
  const pendente = await students.createPendingStudent(
    {
      id: aluno.id,
      name: aluno.name,
      email: aluno.email,
      phone: '51999990000',
      cpf: '52998224725',
      birthDate: '1995-05-10',
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

const codigo = (unit: 'tres-cachoeiras' | 'terra-de-areia' = 'tres-cachoeiras') =>
  qr.getCurrentQrToken(unit).token;

/* -------------------------------------------------------------------------- */

describe('encostar o celular na plaquinha', () => {
  it('grava a presença e leva à confirmação', async () => {
    await matricular(['seg-1930-mma']);
    agora(SEGUNDA, '19:40');

    const response = await encostar(codigo());

    expect(destino(response)).toBe('/presenca/pronto');
    expect(await attendance.countCheckins(aluno.id)).toBe(1);

    // Na turma do horário, não numa qualquer.
    const registros = await attendance.listCheckins(aluno.id, 5);
    expect(registros[0]?.classId).toBe('seg-1930-mma');
  });

  it('encostar de novo não duplica, e ainda confirma', async () => {
    /*
     * O aluno encosta duas vezes porque não tem certeza se funcionou — e
     * numa rota `GET` isso também acontece sozinho, pelo navegador que
     * recarrega ou pré-carrega o endereço visitado. A trava é um `SET NX` por
     * aluno, dia e turma, então o resultado é o mesmo.
     */
    await matricular(['seg-1930-mma']);
    agora(SEGUNDA, '19:40');

    for (let i = 0; i < 5; i += 1) {
      const response = await encostar(codigo());
      expect(destino(response)).toBe('/presenca/pronto');
    }

    expect(await attendance.countCheckins(aluno.id)).toBe(1);
  });

  it('fora da janela da aula não grava', async () => {
    // Três da tarde: nada aberto. A plaquinha manda para a tela, que explica.
    await matricular(['seg-1930-mma']);
    agora(SEGUNDA, '15:00');

    const response = await encostar(codigo());

    expect(destino(response)).toContain('/painel/checkin?t=');
    expect(await attendance.countCheckins(aluno.id)).toBe(0);
  });

  it('sem sessão de aluno não grava nada', async () => {
    /*
     * Na aplicação o middleware intercepta antes e manda para o login
     * guardando o destino. Esta é a segunda camada: se um dia a rota sair da
     * lista protegida, ela ainda não pode gravar presença de ninguém.
     */
    await matricular(['seg-1930-mma']);
    agora(SEGUNDA, '19:40');
    atual = null;

    await expect(encostar(codigo())).rejects.toThrow();
    expect(await attendance.countCheckins(aluno.id)).toBe(0);
  });

  it('código de outra academia não grava', async () => {
    await matricular(['seg-1930-mma'], 'tres-cachoeiras');
    agora(SEGUNDA, '19:40');

    // O cartaz de Terra de Areia: ali o aluno não tem turma nenhuma, e as
    // aulas abertas são de lá — então não há uma turma dele para gravar.
    const response = await encostar(codigo('terra-de-areia'));

    expect(destino(response)).toContain('/painel/checkin?t=');
    expect(await attendance.countCheckins(aluno.id)).toBe(0);
  });

  it('código inventado não grava', async () => {
    await matricular(['seg-1930-mma']);
    agora(SEGUNDA, '19:40');

    const response = await encostar('codigo-que-nao-existe');

    expect(destino(response)).toContain('/painel/checkin?t=');
    expect(await attendance.countCheckins(aluno.id)).toBe(0);
  });

  it('aluno inativo não grava', async () => {
    const ficha = await matricular(['seg-1930-mma']);
    await students.setStudentStatus(ficha, 'inativo', em(SEGUNDA, '10:00'));
    agora(SEGUNDA, '19:40');

    const response = await encostar(codigo());

    expect(destino(response)).toContain('/painel/checkin?t=');
    expect(await attendance.countCheckins(aluno.id)).toBe(0);
  });
});

describe('quando a plaquinha não decide sozinha', () => {
  it('duas turmas dele no horário vão para a pergunta, sem gravar', async () => {
    /*
     * Quem faz MMA e jiu seguidos precisa responder se fica para a segunda —
     * e gravar só a primeira em silêncio seria perder a segunda presença da
     * noite, que é o caso que a pergunta existe para resolver.
     */
    await matricular(['seg-1930-mma', 'seg-2030-jj']);
    agora(SEGUNDA, '19:40');

    const response = await encostar(codigo());

    expect(destino(response)).toContain('/painel/checkin?t=');
    expect(await attendance.countCheckins(aluno.id)).toBe(0);
  });

  it('sem turma dele no horário, a escolha é na tela', async () => {
    // Matriculado só no jiu das 20:30, encosta às 18:40: o kids está aberto,
    // mas não é dele. Escolher por ele seria inventar o treino.
    await matricular(['seg-2030-jj']);
    agora(SEGUNDA, '18:40');

    const response = await encostar(codigo());

    expect(destino(response)).toContain('/painel/checkin?t=');
    expect(await attendance.countCheckins(aluno.id)).toBe(0);
  });

  it('já tendo marcado, confirma em vez de mandar escolher', async () => {
    await matricular(['seg-1930-mma']);
    agora(SEGUNDA, '19:40');
    await encostar(codigo());

    // Meia hora depois ele encosta outra vez. Não há mais turma dele para
    // marcar, mas a resposta é a confirmação tranquila — não a tela de
    // escolha, que não teria nada dele para oferecer.
    agora(SEGUNDA, '20:10');
    const response = await encostar(codigo());

    expect(destino(response)).toBe('/presenca/pronto');
    expect(await attendance.countCheckins(aluno.id)).toBe(1);
  });
});

describe('o código da plaquinha', () => {
  it('é o mesmo do cartaz impresso', async () => {
    // Uma etiqueta e um papel, um código. Trocar o `QR_TOKEN_SECRET` invalida
    // os dois de uma vez, que é o comportamento esperado.
    expect(codigo()).toBe(qr.qrTokenFor('tres-cachoeiras'));
  });

  it('o da unidade resolve na unidade', async () => {
    expect(qr.validateQrToken(codigo('terra-de-areia'))).toEqual({
      ok: true,
      unit: 'terra-de-areia',
    });
  });
});
