import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { UpstashMock } from './upstashMock';

/**
 * Fluxo completo da academia, contra um Redis de verdade (o mock REST).
 *
 * Isto é o que faltava: os testes anteriores só cobriam lógica pura, então
 * erros de banco — serialização, tipo de retorno, transação — só apareciam em
 * produção. Aqui cada passo da vida de um aluno é exercitado de ponta a ponta:
 * cadastro, aprovação, mensalidade, presença, ranking e graduação.
 */

const mock = new UpstashMock();

// Os repositórios leem as credenciais na primeira chamada, então o ambiente
// precisa estar pronto antes de qualquer import deles.
let students: typeof import('@/lib/repositories/students');
let payments: typeof import('@/lib/repositories/payments');
let attendance: typeof import('@/lib/repositories/attendance');
let graduation: typeof import('@/lib/repositories/graduation');
let qr: typeof import('@/lib/repositories/qr');
let scheduleAdmin: typeof import('@/lib/repositories/scheduleAdmin');
let classLog: typeof import('@/lib/repositories/classLog');

beforeAll(async () => {
  const { url, token } = await mock.start();
  process.env['UPSTASH_REDIS_REST_URL'] = url;
  process.env['UPSTASH_REDIS_REST_TOKEN'] = token;
  process.env['QR_TOKEN_SECRET'] = 'segredo-de-teste-com-tamanho-suficiente';

  students = await import('@/lib/repositories/students');
  payments = await import('@/lib/repositories/payments');
  attendance = await import('@/lib/repositories/attendance');
  graduation = await import('@/lib/repositories/graduation');
  qr = await import('@/lib/repositories/qr');
  scheduleAdmin = await import('@/lib/repositories/scheduleAdmin');
  classLog = await import('@/lib/repositories/classLog');
});

afterAll(async () => {
  await mock.stop();
});

beforeEach(() => {
  mock.reset();
});

/** Segunda-feira, 19h40 — dentro da aula de MMA das 19h30. */
const DURANTE_MMA = new Date('2026-03-02T19:40:00-03:00');

const fichaBase = {
  id: 'user_aluno_1',
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
  consentAt: '2026-03-01T12:00:00.000Z',
};

describe('cadastro do aluno', () => {
  it('grava a ficha e entra na fila de pendentes', async () => {
    const now = new Date('2026-03-01T12:00:00-03:00');
    const created = await students.createPendingStudent(fichaBase, now);

    expect(created.status).toBe('pendente');
    expect(created.category).toBe('adulto');

    const lido = await students.getStudent(fichaBase.id);
    expect(lido).not.toBeNull();
    expect(lido?.name).toBe('Aluno de Teste');
    expect(lido?.cpf).toBe('52998224725');
    expect(lido?.classIds).toEqual([]);

    const pendentes = await students.listStudentsByStatus('pendente');
    expect(pendentes.map((s) => s.id)).toEqual([fichaBase.id]);
  });

  it('classifica menor de 16 como infantil', async () => {
    const now = new Date('2026-03-01T12:00:00-03:00');
    const created = await students.createPendingStudent(
      { ...fichaBase, id: 'user_kid', birthDate: '2018-06-10' },
      now,
    );

    expect(created.category).toBe('kids');
  });

  it('preserva CPF com zero à esquerda', async () => {
    // O cliente Upstash desserializa JSON sozinho: sem a coerção defensiva,
    // "01234567890" voltaria como número e perderia o zero.
    const now = new Date('2026-03-01T12:00:00-03:00');
    await students.createPendingStudent(
      { ...fichaBase, id: 'user_zero', cpf: '01234567890' },
      now,
    );

    const lido = await students.getStudent('user_zero');
    expect(lido?.cpf).toBe('01234567890');
  });

  it('sobrescrever o cadastro não duplica na fila', async () => {
    const now = new Date('2026-03-01T12:00:00-03:00');
    await students.createPendingStudent(fichaBase, now);
    await students.createPendingStudent({ ...fichaBase, name: 'Nome Corrigido' }, now);

    const pendentes = await students.listStudentsByStatus('pendente');
    expect(pendentes).toHaveLength(1);
    expect(pendentes[0]?.name).toBe('Nome Corrigido');
  });

  it('contagem por status reflete a fila', async () => {
    const now = new Date('2026-03-01T12:00:00-03:00');
    await students.createPendingStudent(fichaBase, now);
    await students.createPendingStudent({ ...fichaBase, id: 'user_2' }, now);

    const counts = await students.countByStatus();
    expect(counts.pendente).toBe(2);
    expect(counts.ativo).toBe(0);
  });
});

describe('aprovação', () => {
  it('ativa o aluno, atribui turmas e sai da fila de pendentes', async () => {
    const now = new Date('2026-03-01T12:00:00-03:00');
    const pendente = await students.createPendingStudent(fichaBase, now);

    const aprovado = await students.approveStudent(
      pendente,
      { classIds: ['seg-1930-mma', 'qua-1930-mma'], belt: 'branca', degree: 0, notes: '' },
      now,
    );

    expect(aprovado.status).toBe('ativo');
    expect(aprovado.joinedAt).not.toBeNull();

    const lido = await students.getStudent(fichaBase.id);
    expect(lido?.status).toBe('ativo');
    expect(lido?.classIds).toEqual(['seg-1930-mma', 'qua-1930-mma']);

    // O aluno não pode aparecer nas duas filas ao mesmo tempo.
    expect(await students.listStudentsByStatus('pendente')).toEqual([]);
    expect((await students.listStudentsByStatus('ativo')).map((s) => s.id)).toEqual([
      fichaBase.id,
    ]);
  });

  it('recusa guarda o motivo para o aluno ver', async () => {
    const now = new Date('2026-03-01T12:00:00-03:00');
    const pendente = await students.createPendingStudent(fichaBase, now);

    await students.rejectStudent(pendente, 'Documento ilegível', now);

    const lido = await students.getStudent(fichaBase.id);
    expect(lido?.status).toBe('recusado');
    expect(lido?.rejectionReason).toBe('Documento ilegível');
  });

  it('criança aprovada entra no índice de elegibilidade a grau', async () => {
    const now = new Date('2026-03-01T12:00:00-03:00');
    const kid = await students.createPendingStudent(
      { ...fichaBase, id: 'user_kid', birthDate: '2018-06-10' },
      now,
    );
    await students.approveStudent(
      kid,
      { classIds: ['seg-1830-kids'], belt: 'branca', degree: 0, notes: '' },
      now,
    );

    // 30 dias depois da matrícula ele aparece como elegível.
    const antes = await students.listGraduationDueIds(new Date('2026-03-20T12:00:00-03:00'));
    expect(antes).toEqual([]);

    const depois = await students.listGraduationDueIds(new Date('2026-04-02T12:00:00-03:00'));
    expect(depois).toEqual(['user_kid']);
  });

  it('adulto não entra no índice infantil', async () => {
    const now = new Date('2026-03-01T12:00:00-03:00');
    const adulto = await students.createPendingStudent(fichaBase, now);
    await students.approveStudent(
      adulto,
      { classIds: [], belt: 'branca', degree: 0, notes: '' },
      now,
    );

    expect(await students.listGraduationDueIds(new Date('2027-01-01T12:00:00-03:00'))).toEqual([]);
  });
});

describe('mensalidade', () => {
  const now = new Date('2026-03-01T12:00:00-03:00');

  async function alunoAtivo() {
    const pendente = await students.createPendingStudent(fichaBase, now);
    return students.approveStudent(
      pendente,
      { classIds: ['seg-1930-mma'], belt: 'branca', degree: 0, notes: '' },
      now,
    );
  }

  it('define o plano e calcula o primeiro vencimento', async () => {
    await alunoAtivo();

    const plan = await payments.setupPaymentPlan(
      { userId: fichaBase.id, planId: 'mensal', amountCents: 15000, dueDay: 11, graceDays: 4 },
      now,
    );

    expect(plan.dueDate).toBe('2026-03-11');

    const lido = await payments.getPaymentPlan(fichaBase.id);
    expect(lido?.amountCents).toBe(15000);
    expect(lido?.dueDay).toBe(11);
  });

  it('marcar como pago avança o vencimento e grava no histórico', async () => {
    await alunoAtivo();
    const plan = await payments.setupPaymentPlan(
      { userId: fichaBase.id, planId: 'mensal', amountCents: 15000, dueDay: 11, graceDays: 4 },
      now,
    );

    const pago = await payments.registerPayment(
      plan,
      { method: 'pix', registeredBy: 'user_admin' },
      new Date('2026-03-10T12:00:00-03:00'),
    );

    expect(pago.dueDate).toBe('2026-04-11');

    const historico = await payments.listPaymentHistory(fichaBase.id);
    expect(historico).toHaveLength(1);
    expect(historico[0]?.amountCents).toBe(15000);
    expect(historico[0]?.referenceMonth).toBe('2026-03');
    expect(historico[0]?.method).toBe('pix');
  });

  it('desfazer o pagamento volta o vencimento e limpa o histórico', async () => {
    await alunoAtivo();
    const plan = await payments.setupPaymentPlan(
      { userId: fichaBase.id, planId: 'mensal', amountCents: 15000, dueDay: 11, graceDays: 4 },
      now,
    );
    const pago = await payments.registerPayment(
      plan,
      { method: 'pix', registeredBy: 'user_admin' },
      new Date('2026-03-10T12:00:00-03:00'),
    );

    const desfeito = await payments.undoLastPayment(pago, new Date('2026-03-10T12:05:00-03:00'));

    expect(desfeito.dueDate).toBe('2026-03-11');
    expect(desfeito.lastPaidAt).toBeNull();
    expect(await payments.listPaymentHistory(fichaBase.id)).toEqual([]);
  });

  it('lista inadimplentes pelo índice, sem varrer a base', async () => {
    await alunoAtivo();
    await payments.setupPaymentPlan(
      { userId: fichaBase.id, planId: 'mensal', amountCents: 15000, dueDay: 11, graceDays: 4 },
      now,
    );

    // Esta é a consulta que quebrava com `-Infinity` e derrubava o /admin.
    expect(await payments.listOverdueIds(new Date('2026-03-05T12:00:00-03:00'))).toEqual([]);
    expect(await payments.listOverdueIds(new Date('2026-03-20T12:00:00-03:00'))).toEqual([
      fichaBase.id,
    ]);
  });
});

describe('presença e ranking', () => {
  const matricula = new Date('2026-02-01T12:00:00-03:00');

  async function alunoAtivo(id: string, belt = 'branca') {
    const pendente = await students.createPendingStudent({ ...fichaBase, id }, matricula);
    return students.approveStudent(
      pendente,
      { classIds: ['seg-1930-mma'], belt, degree: 0, notes: '' },
      matricula,
    );
  }

  it('registra a presença e soma no ranking', async () => {
    const aluno = await alunoAtivo('user_a');

    const result = await attendance.recordCheckin(
      {
        student: aluno,
        classId: 'seg-1930-mma',
        classTitle: 'MMA',
        source: 'qr',
        registeredBy: aluno.id,
      },
      DURANTE_MMA,
    );

    expect(result.ok).toBe(true);
    expect(await attendance.countCheckins('user_a')).toBe(1);
    expect(await attendance.hasCheckedInToday('user_a', DURANTE_MMA)).toBe(true);

    const ranking = await attendance.getRanking({});
    expect(ranking).toEqual([{ userId: 'user_a', score: 1, position: 1 }]);
  });

  it('recusa o segundo check-in no mesmo dia', async () => {
    const aluno = await alunoAtivo('user_a');
    const entrada = {
      student: aluno,
      classId: 'seg-1930-mma',
      classTitle: 'MMA',
      source: 'qr' as const,
      registeredBy: aluno.id,
    };

    expect((await attendance.recordCheckin(entrada, DURANTE_MMA)).ok).toBe(true);

    const segunda = await attendance.recordCheckin(entrada, DURANTE_MMA);
    expect(segunda.ok).toBe(false);
    expect(segunda.ok === false && segunda.reason).toBe('ja_registrado');

    // E não pode ter contado ponto duas vezes.
    expect(await attendance.countCheckins('user_a')).toBe(1);
  });

  it('dois cliques simultâneos registram uma presença só', async () => {
    const aluno = await alunoAtivo('user_a');
    const entrada = {
      student: aluno,
      classId: 'seg-1930-mma',
      classTitle: 'MMA',
      source: 'qr' as const,
      registeredBy: aluno.id,
    };

    const [a, b] = await Promise.all([
      attendance.recordCheckin(entrada, DURANTE_MMA),
      attendance.recordCheckin(entrada, DURANTE_MMA),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await attendance.countCheckins('user_a')).toBe(1);
  });

  it('permite check-in de novo no dia seguinte', async () => {
    const aluno = await alunoAtivo('user_a');
    const entrada = {
      student: aluno,
      classId: 'seg-1930-mma',
      classTitle: 'MMA',
      source: 'manual' as const,
      registeredBy: 'user_admin',
    };

    await attendance.recordCheckin(entrada, DURANTE_MMA);
    const amanha = await attendance.recordCheckin(
      entrada,
      new Date('2026-03-03T19:40:00-03:00'),
    );

    expect(amanha.ok).toBe(true);
    expect(await attendance.countCheckins('user_a')).toBe(2);
  });

  it('ordena o ranking por número de treinos', async () => {
    const a = await alunoAtivo('user_a');
    const b = await alunoAtivo('user_b');
    const c = await alunoAtivo('user_c');

    const marcar = (aluno: typeof a, dia: string) =>
      attendance.recordCheckin(
        {
          student: aluno,
          classId: 'seg-1930-mma',
          classTitle: 'MMA',
          source: 'lote',
          registeredBy: 'user_admin',
        },
        new Date(`${dia}T19:40:00-03:00`),
      );

    await marcar(b, '2026-03-02');
    await marcar(b, '2026-03-03');
    await marcar(b, '2026-03-04');
    await marcar(a, '2026-03-02');
    await marcar(a, '2026-03-03');
    await marcar(c, '2026-03-02');

    const ranking = await attendance.getRanking({});
    expect(ranking.map((r) => [r.userId, r.score])).toEqual([
      ['user_b', 3],
      ['user_a', 2],
      ['user_c', 1],
    ]);

    const posicao = await attendance.getRankingPosition('user_a');
    expect(posicao).toEqual({ position: 2, score: 2 });
  });

  it('mantém ranking mensal separado do geral', async () => {
    const aluno = await alunoAtivo('user_a');
    const marcar = (dia: string) =>
      attendance.recordCheckin(
        {
          student: aluno,
          classId: 'seg-1930-mma',
          classTitle: 'MMA',
          source: 'manual',
          registeredBy: 'user_admin',
        },
        new Date(`${dia}T19:40:00-03:00`),
      );

    await marcar('2026-02-02');
    await marcar('2026-03-02');
    await marcar('2026-03-03');

    expect(await attendance.getRanking({ month: '2026-03' })).toEqual([
      { userId: 'user_a', score: 2, position: 1 },
    ]);
    expect(await attendance.getRanking({ month: '2026-02' })).toEqual([
      { userId: 'user_a', score: 1, position: 1 },
    ]);
    expect((await attendance.getRanking({}))[0]?.score).toBe(3);
  });

  it('separa o ranking por faixa', async () => {
    const branca = await alunoAtivo('user_branca', 'branca');
    const azul = await alunoAtivo('user_azul', 'azul');

    const marcar = (aluno: typeof branca) =>
      attendance.recordCheckin(
        {
          student: aluno,
          classId: 'seg-1930-mma',
          classTitle: 'MMA',
          source: 'manual',
          registeredBy: 'user_admin',
        },
        DURANTE_MMA,
      );

    await marcar(branca);
    await marcar(azul);

    expect(await attendance.getRanking({ belt: 'azul' })).toEqual([
      { userId: 'user_azul', score: 1, position: 1 },
    ]);
    expect(await attendance.getRanking({ belt: 'branca' })).toEqual([
      { userId: 'user_branca', score: 1, position: 1 },
    ]);
  });

  it('desfazer presença remove do dia e do ranking', async () => {
    const aluno = await alunoAtivo('user_a');
    await attendance.recordCheckin(
      {
        student: aluno,
        classId: 'seg-1930-mma',
        classTitle: 'MMA',
        source: 'manual',
        registeredBy: 'user_admin',
      },
      DURANTE_MMA,
    );

    const removido = await attendance.undoCheckin(aluno, '2026-03-02', DURANTE_MMA);

    expect(removido).toBe(true);
    expect(await attendance.hasCheckedInToday('user_a', DURANTE_MMA)).toBe(false);
    expect(await attendance.getRanking({})).toEqual([]);

    // E o aluno pode bater presença de novo no mesmo dia.
    const denovo = await attendance.recordCheckin(
      {
        student: aluno,
        classId: 'seg-1930-mma',
        classTitle: 'MMA',
        source: 'manual',
        registeredBy: 'user_admin',
      },
      DURANTE_MMA,
    );
    expect(denovo.ok).toBe(true);
  });

  it('presença em lote marca vários alunos', async () => {
    const lista = await Promise.all([alunoAtivo('user_a'), alunoAtivo('user_b')]);

    for (const aluno of lista) {
      await attendance.recordCheckin(
        {
          student: aluno,
          classId: 'seg-1930-mma',
          classTitle: 'MMA',
          source: 'lote',
          registeredBy: 'user_admin',
        },
        DURANTE_MMA,
      );
    }

    const hoje = await attendance.getTodayCheckins(['user_a', 'user_b'], DURANTE_MMA);
    expect(hoje.size).toBe(2);
    expect(hoje.get('user_a')?.source).toBe('lote');
  });

  it('guarda o histórico com a aula e a origem', async () => {
    const aluno = await alunoAtivo('user_a');
    await attendance.recordCheckin(
      {
        student: aluno,
        classId: 'seg-1930-mma',
        classTitle: 'MMA',
        source: 'qr',
        registeredBy: aluno.id,
      },
      DURANTE_MMA,
    );

    const historico = await attendance.listCheckins('user_a');
    expect(historico).toHaveLength(1);
    expect(historico[0]?.classTitle).toBe('MMA');
    expect(historico[0]?.source).toBe('qr');
    expect(historico[0]?.date).toBe('2026-03-02');
  });
});

describe('QR de presença (um cartaz por academia)', () => {
  const TC = 'tres-cachoeiras';
  const TA = 'terra-de-areia';

  it('gera o código da academia e resolve de volta', () => {
    const token = qr.getCurrentQrToken(TC);
    expect(token.unit).toBe(TC);
    expect(token.token.length).toBeGreaterThan(10);

    const lido = qr.validateQrToken(token.token);
    expect(lido.ok).toBe(true);
    expect(lido.ok === true && lido.unit).toBe(TC);
  });

  it('o código não muda entre chamadas — é o que permite imprimir', () => {
    expect(qr.getCurrentQrToken(TC).token).toBe(qr.getCurrentQrToken(TC).token);
  });

  it('cada academia tem o seu — o cartaz de uma não serve na outra', () => {
    const a = qr.getCurrentQrToken(TC);
    const b = qr.getCurrentQrToken(TA);

    expect(a.token).not.toBe(b.token);

    const lido = qr.validateQrToken(b.token);
    expect(lido.ok === true && lido.unit).toBe(TA);
  });

  it('recusa código inventado', () => {
    const result = qr.validateQrToken('token-falso');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('qr_invalido');
  });

  it('recusa código vazio ou absurdamente longo', () => {
    expect(qr.validateQrToken('').ok).toBe(false);
    expect(qr.validateQrToken('x'.repeat(200)).ok).toBe(false);
  });

  it('aceita o id da unidade puro, para link colado à mão', () => {
    // Um QR antigo ou um link digitado continuam levando à tela certa, em
    // vez de um erro seco.
    const lido = qr.validateQrToken(TA);
    expect(lido.ok === true && lido.unit).toBe(TA);
  });

  it('funciona sem QR_TOKEN_SECRET configurado', () => {
    // O código fica colado na parede: não é segredo. Exigir a variável só
    // criava um jeito de a tela inteira falhar.
    const anterior = process.env['QR_TOKEN_SECRET'];
    process.env['QR_TOKEN_SECRET'] = '';

    const token = qr.getCurrentQrToken(TC);
    expect(token.token.length).toBeGreaterThan(10);
    expect(qr.validateQrToken(token.token).ok).toBe(true);

    process.env['QR_TOKEN_SECRET'] = anterior;
  });

  it('trocar o segredo invalida os cartazes antigos', () => {
    const anterior = process.env['QR_TOKEN_SECRET'];
    const antes = qr.getCurrentQrToken(TC).token;

    process.env['QR_TOKEN_SECRET'] = 'outro-segredo-bem-comprido-aqui';
    const depois = qr.getCurrentQrToken(TC).token;
    process.env['QR_TOKEN_SECRET'] = anterior;

    expect(depois).not.toBe(antes);
  });
});

describe('graduação', () => {
  const matricula = new Date('2026-01-01T12:00:00-03:00');

  async function kidAtivo() {
    const pendente = await students.createPendingStudent(
      { ...fichaBase, id: 'user_kid', birthDate: '2018-06-10', belt: 'cinza' },
      matricula,
    );
    return students.approveStudent(
      pendente,
      { classIds: ['seg-1830-kids'], belt: 'cinza', degree: 0, notes: '' },
      matricula,
    );
  }

  it('registra grau e reagenda a próxima elegibilidade', async () => {
    const kid = await kidAtivo();
    const hoje = new Date('2026-02-10T12:00:00-03:00');

    const result = await graduation.registerDegree(kid, 'user_admin', hoje);
    expect(result.ok).toBe(true);
    expect(result.degree).toBe(1);

    const lido = await students.getStudent('user_kid');
    expect(lido?.degree).toBe(1);
    expect(lido?.lastGraduationAt).not.toBeNull();

    // Só volta a ficar elegível 30 dias depois.
    expect(await students.listGraduationDueIds(new Date('2026-03-01T12:00:00-03:00'))).toEqual([]);
    expect(await students.listGraduationDueIds(new Date('2026-03-15T12:00:00-03:00'))).toEqual([
      'user_kid',
    ]);
  });

  it('grava o histórico com a cor da tarja', async () => {
    const kid = await kidAtivo();
    const hoje = new Date('2026-02-10T12:00:00-03:00');

    await graduation.registerDegree(kid, 'user_admin', hoje);

    const historico = await graduation.listGraduationHistory('user_kid');
    expect(historico).toHaveLength(1);
    expect(historico[0]?.toDegree).toBe(1);
    expect(historico[0]?.stripeColor).toBe('branca');
  });

  it('desfazer volta o grau e a âncora', async () => {
    const kid = await kidAtivo();
    const hoje = new Date('2026-02-10T12:00:00-03:00');

    await graduation.registerDegree(kid, 'user_admin', hoje);
    const atual = await students.getStudent('user_kid');
    expect(atual).not.toBeNull();

    const desfeito = await graduation.undoLastDegree(atual!, hoje);
    expect(desfeito.ok).toBe(true);
    expect(desfeito.degree).toBe(0);

    const lido = await students.getStudent('user_kid');
    expect(lido?.degree).toBe(0);
    expect(await graduation.listGraduationHistory('user_kid')).toEqual([]);
  });

  it('sai do índice ao completar os 12 graus', async () => {
    const kid = await kidAtivo();
    let atual = kid;

    for (let grau = 1; grau <= 12; grau++) {
      await graduation.registerDegree(atual, 'user_admin', new Date('2026-02-10T12:00:00-03:00'));
      atual = (await students.getStudent('user_kid'))!;
    }

    expect(atual.degree).toBe(12);
    // Grau 12 fechado: a troca de faixa é decisão manual, então sai da fila.
    expect(await students.listGraduationDueIds(new Date('2027-01-01T12:00:00-03:00'))).toEqual([]);
  });

  it('promoção de faixa zera os graus e move o ranking', async () => {
    const kid = await kidAtivo();
    await attendance.recordCheckin(
      {
        student: kid,
        classId: 'seg-1830-kids',
        classTitle: 'Kids',
        source: 'manual',
        registeredBy: 'user_admin',
      },
      new Date('2026-02-02T18:40:00-03:00'),
    );
    await graduation.registerDegree(kid, 'user_admin', new Date('2026-02-10T12:00:00-03:00'));

    const atual = (await students.getStudent('user_kid'))!;
    await graduation.promoteBelt(atual, 'amarela', 'user_admin', 'Avaliação', new Date());

    const lido = await students.getStudent('user_kid');
    expect(lido?.belt).toBe('amarela');
    expect(lido?.degree).toBe(0);

    // O ponto acompanha a faixa nova.
    expect(await attendance.getRanking({ belt: 'amarela' })).toEqual([
      { userId: 'user_kid', score: 1, position: 1 },
    ]);
    expect(await attendance.getRanking({ belt: 'cinza' })).toEqual([]);
  });
});

describe('grade de horários', () => {
  it('salva, edita e remove turma', async () => {
    const now = new Date('2026-03-01T12:00:00-03:00');

    const criada = await scheduleAdmin.upsertClass(
      {
        weekday: 1,
        startTime: '19:30',
        endTime: '20:30',
        title: 'MMA',
        modality: 'mma',
        level: 'Todos os níveis',
        unit: 'tres-cachoeiras',
      },
      now,
    );
    expect(criada.ok).toBe(true);

    const grade = await scheduleAdmin.getEditableSchedule();
    const salva = grade.find((item) => item.title === 'MMA' && item.weekday === 1);
    expect(salva).toBeDefined();

    await scheduleAdmin.removeClass(salva!.id, now);
    const depois = await scheduleAdmin.getEditableSchedule();
    expect(depois.find((item) => item.id === salva!.id)).toBeUndefined();
  });

  it('recusa turma com fim antes do início', async () => {
    const result = await scheduleAdmin.upsertClass(
      {
        weekday: 1,
        startTime: '20:30',
        endTime: '19:30',
        title: 'Inválida',
        modality: 'mma',
        level: '',
        unit: 'tres-cachoeiras',
      },
      new Date(),
    );

    expect(result.ok).toBe(false);
  });
});

describe('mudança de situação', () => {
  it('inativar tira o aluno dos índices de cobrança e graduação', async () => {
    const now = new Date('2026-03-01T12:00:00-03:00');
    const kid = await students.createPendingStudent(
      { ...fichaBase, id: 'user_kid', birthDate: '2018-06-10' },
      now,
    );
    const ativo = await students.approveStudent(
      kid,
      { classIds: [], belt: 'branca', degree: 0, notes: '' },
      now,
    );
    await payments.setupPaymentPlan(
      { userId: 'user_kid', planId: 'mensal', amountCents: 10000, dueDay: 5, graceDays: 4 },
      now,
    );

    await students.setStudentStatus(ativo, 'inativo', now);

    const futuro = new Date('2026-06-01T12:00:00-03:00');
    expect(await students.listGraduationDueIds(futuro)).toEqual([]);
    expect(await payments.listOverdueIds(futuro)).toEqual([]);

    const counts = await students.countByStatus();
    expect(counts.ativo).toBe(0);
    expect(counts.inativo).toBe(1);
  });
});

describe('diário de aula', () => {
  const TURMA = 'tres-cachoeiras-1-1930-mma';
  const QUARTA = new Date('2026-03-04T21:40:00-03:00');

  it('grava e lê o que foi treinado', async () => {
    const result = await classLog.saveClassLog(
      TURMA,
      '2026-03-02',
      'Passagem de guarda em pé, 6 rounds de 5 min.',
      'admin_1',
      DURANTE_MMA,
    );

    expect(result.ok).toBe(true);

    const entradas = await classLog.listClassLog(TURMA);
    expect(entradas).toHaveLength(1);
    expect(entradas[0]?.text).toContain('Passagem de guarda');
    expect(entradas[0]?.author).toBe('admin_1');
  });

  it('salvar de novo no mesmo dia substitui, não duplica', async () => {
    // O professor escreve no fim da aula, às vezes em duas tentativas.
    await classLog.saveClassLog(TURMA, '2026-03-02', 'Primeira versão', 'admin_1', DURANTE_MMA);
    await classLog.saveClassLog(TURMA, '2026-03-02', 'Versão corrigida', 'admin_1', DURANTE_MMA);

    const entradas = await classLog.listClassLog(TURMA);
    expect(entradas).toHaveLength(1);
    expect(entradas[0]?.text).toBe('Versão corrigida');
  });

  it('lista da aula mais recente para a mais antiga', async () => {
    await classLog.saveClassLog(TURMA, '2026-03-02', 'Segunda', 'admin_1', DURANTE_MMA);
    await classLog.saveClassLog(TURMA, '2026-03-04', 'Quarta', 'admin_1', QUARTA);

    const entradas = await classLog.listClassLog(TURMA);
    expect(entradas.map((e) => e.date)).toEqual(['2026-03-04', '2026-03-02']);
  });

  it('cada turma tem o seu diário', async () => {
    await classLog.saveClassLog(TURMA, '2026-03-02', 'MMA', 'admin_1', DURANTE_MMA);
    await classLog.saveClassLog('outra-turma', '2026-03-02', 'Kids', 'admin_1', DURANTE_MMA);

    expect((await classLog.listClassLog(TURMA))[0]?.text).toBe('MMA');
    expect((await classLog.listClassLog('outra-turma'))[0]?.text).toBe('Kids');
  });

  it('recusa texto vazio e data inválida', async () => {
    const vazio = await classLog.saveClassLog(TURMA, '2026-03-02', '   ', 'admin_1', DURANTE_MMA);
    expect(vazio.ok).toBe(false);

    const data = await classLog.saveClassLog(TURMA, '02/03/2026', 'Algo', 'admin_1', DURANTE_MMA);
    expect(data.ok).toBe(false);
  });

  it('turma sem diário devolve lista vazia', async () => {
    expect(await classLog.listClassLog('turma-nova')).toEqual([]);
  });
});
