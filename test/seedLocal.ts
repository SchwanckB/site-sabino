/**
 * Sobe um Redis de teste já populado e deixa o processo no ar.
 *
 * Existe para olhar as telas cheias — grade do calendário, agenda de
 * graduação, dashboards — sem tocar no banco de produção. Testar layout com
 * lista vazia esconde justamente as quebras que aparecem com conteúdo real:
 * nome comprido, cinco itens no mesmo dia, valor de seis dígitos.
 *
 *   npx tsx --conditions=react-server test/seedLocal.ts
 *
 * Imprime URL e token para o Next apontar via env.
 */

import { UpstashMock } from './upstashMock';

const PORT = 4321;

type Dados = readonly [
  nome: string,
  sexo: 'masculino' | 'feminino',
  nascimento: string,
  faixa: string,
  grau: number,
  diasDesdeGraduacao: number,
  treinos: number,
];

/** Nome comprido de propósito no meio da lista: é onde o layout quebra. */
const KIDS: readonly Dados[] = [
  ['Ana Clara Figueiredo Sabino', 'feminino', 'ANIV_HOJE', 'cinza-branca', 3, 40, 11],
  ['Bruno Lima', 'masculino', '2015-09-02', 'amarela-preta', 4, 62, 9],
  ['Clara Souza', 'feminino', '2019-01-23', 'branca', 0, 12, 4],
  ['Davi Rocha', 'masculino', '2013-06-07', 'verde-preta', 10, 31, 13],
  ['Eduarda Dias', 'feminino', '2020-11-19', 'branca', 1, 5, 2],
  ['Felipe Alves', 'masculino', '2016-03-05', 'laranja-branca', 6, 29, 7],
  ['Gabriela Melo', 'feminino', '2018-08-14', 'cinza', 2, 55, 0],
  ['Heitor Pinto', 'masculino', 'ANIV_FIM', 'amarela', 12, 90, 6],
  ['Isabela Nunes', 'feminino', 'QUASE_16', 'laranja', 11, 28, 10],
  ['João Vitor Krause', 'masculino', '2018-05-09', 'cinza', 1, 33, 5],
];

const ADULTOS: readonly Dados[] = [
  ['Lucas Martins', 'masculino', '1995-02-14', 'azul', 2, 20, 12],
  ['Mariana Costa', 'feminino', '1999-06-03', 'roxa', 3, 3, 8],
  ['Nicolas Reis', 'masculino', '2004-10-21', 'branca', 4, 45, 3],
  ['Otávio Brum', 'masculino', '1988-04-08', 'marrom', 1, 120, 14],
  ['Paula Nunes', 'feminino', '1981-12-01', 'preta', 1, 8, 5],
  ['Rafael Dias', 'masculino', '2007-03-17', 'azul', 0, 1, 0],
  ['Sabrina Oliveira Wagner', 'feminino', '1992-09-25', 'branca', 2, 70, 9],
];

async function main(): Promise<void> {
  const mock = new UpstashMock();
  const { url, token } = await mock.start(PORT);

  process.env['UPSTASH_REDIS_REST_URL'] = url;
  process.env['UPSTASH_REDIS_REST_TOKEN'] = token;

  const students = await import('../lib/repositories/students');
  const payments = await import('../lib/repositories/payments');
  const attendance = await import('../lib/repositories/attendance');
  const calendar = await import('../lib/repositories/calendar');

  const now = new Date();
  const atras = (dias: number) => new Date(now.getTime() - dias * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const mes = iso(now).slice(0, 7);
  /** Nasceu no mes corrente: garante aniversariante na tela de teste. */
  const nasceuEsteMes = (ano: number, dia: number) =>
    ano + '-' + mes.slice(5, 7) + '-' + String(dia).padStart(2, '0');

  async function criar(
    id: string,
    dados: Dados,
    turmas: readonly string[],
    unit: 'tres-cachoeiras' | 'terra-de-areia' = 'tres-cachoeiras',
  ): Promise<void> {
    const [nome, sexo, marcador, faixa, grau, diasGrad, treinos] = dados;

    // Marcadores viram datas reais em torno de hoje, para os avisos da tela
    // de teste nunca aparecerem vazios.
    const nascimento =
      marcador === 'ANIV_HOJE'
        ? '2017-' + iso(now).slice(5)
        : marcador === 'ANIV_FIM'
          ? nasceuEsteMes(2014, 28)
          : marcador === 'QUASE_16'
            ? iso(new Date(now.getTime() + 40 * 86_400_000 - 16 * 365.25 * 86_400_000))
            : marcador;

    const ficha = await students.createPendingStudent(
      {
        id,
        name: nome,
        email: id + '@exemplo.test',
        phone: '51999990000',
        cpf: '52998224725',
        birthDate: nascimento,
        gender: sexo,
        belt: faixa,
        guardianName: null,
        guardianPhone: null,
        guardianCpf: null,
        docBlobKey: null,
        consentVersion: 'lgpd-2026-01',
        consentAt: now.toISOString(),
        degree: grau,
        unit,
        graduatesMonthly: nome !== 'Gabriela Melo',
      },
      atras(400),
    );

    const ativo = await students.approveStudent(
      ficha,
      { classIds: [...turmas], belt: faixa, degree: grau, notes: '' },
      atras(400),
    );

    await students.updateStudent(id, { lastGraduationAt: atras(diasGrad).toISOString() }, now);

    // Um terço vencido: o dashboard financeiro precisa ter as duas cores.
    const vencido = Number(id.slice(-1)) % 3 === 0;
    await payments.setupPaymentPlan(
      {
        userId: id,
        planId: 'mensal',
        amountCents: 15_000,
        dueDay: 11,
        graceDays: 4,
        firstDueDate: iso(vencido ? atras(25) : atras(-6)),
      },
      now,
    );

    for (let i = 0; i < treinos; i++) {
      await attendance.recordCheckin(
        {
          student: ativo,
          classId: turmas[0] ?? null,
          classTitle: 'Treino',
          source: i % 3 === 0 ? 'qr' : 'lote',
          registeredBy: 'seed',
        },
        atras(i * 2 + 1),
      );
    }
  }

  for (const [i, dados] of KIDS.entries()) {
    const turmas = i % 2 === 0 ? ['seg-1830-kids', 'qui-1830-kids'] : ['ter-1830-infantil'];
    await criar('kid_' + i, dados, turmas, i % 3 === 0 ? 'terra-de-areia' : 'tres-cachoeiras');
  }
  for (const [i, dados] of ADULTOS.entries()) {
    await criar('adt_' + i, dados, ['seg-1930-mma', 'seg-2030-jj'], i % 3 === 0 ? 'terra-de-areia' : 'tres-cachoeiras');
  }

  // Ficha para o ID real do Clerk usado nos testes de tela: sem ela o painel
  // do aluno redireciona e não há como medir o layout. É o caso legítimo do
  // professor que também treina.
  const CLERK_ID = process.env['SEED_CLERK_USER_ID'] ?? '';
  if (CLERK_ID.length > 0) {
    await criar(CLERK_ID, ['Professor Sabino', 'masculino', '1990-01-15', 'preta', 2, 200, 9], [
      'seg-2030-jj',
      'seg-1930-mma',
    ]);
  }

  // Dois pendentes, para a tela de aprovações não ficar vazia.
  await students.createPendingStudent(
    {
      id: 'pend_1',
      name: 'Tiago Pereira',
      email: 'tiago@exemplo.test',
      phone: '51988887777',
      cpf: '52998224725',
      birthDate: '2001-05-05',
      gender: 'masculino',
      belt: 'branca',
      guardianName: null,
      guardianPhone: null,
      guardianCpf: null,
      docBlobKey: null,
      consentVersion: 'lgpd-2026-01',
      consentAt: now.toISOString(),
    },
    atras(2),
  );
  await students.createPendingStudent(
    {
      id: 'pend_2',
      name: 'Valentina Prass',
      email: 'valentina@exemplo.test',
      phone: '51977776666',
      cpf: '52998224725',
      birthDate: '2019-10-10',
      gender: 'feminino',
      belt: 'branca',
      guardianName: 'Carla Prass',
      guardianPhone: '51966665555',
      guardianCpf: '52998224725',
      docBlobKey: null,
      consentVersion: 'lgpd-2026-01',
      consentAt: now.toISOString(),
    },
    atras(1),
  );

  // Eventos: feriado que fecha, feriado que não fecha, nome longo, e dois no
  // mesmo dia — os quatro casos que apertam a célula do calendário.
  const settings = await import('../lib/repositories/settings');
  await settings.saveAcademySettings(
    { pixKey: '51981691373', pixOwner: 'Sabino Academia' },
    now,
  );

  const eventos = [
    { date: mes + '-07', title: 'Feriado — academia fechada', kind: 'feriado', time: '', note: '', closesAcademy: true },
    { date: mes + '-15', title: 'Ponto facultativo', kind: 'feriado', time: '', note: 'Aulas mantidas', closesAcademy: false },
    { date: mes + '-21', title: 'Confraternização de fim de temporada da Sabino', kind: 'evento', time: '19:00', note: 'Churrasco no tatame, levar acompanhante', closesAcademy: false },
    { date: mes + '-28', title: 'Exame de faixa', kind: 'graduacao', time: '18:00', note: 'Adultos', closesAcademy: false },
    { date: mes + '-28', title: 'Fotos oficiais', kind: 'aviso', time: '17:00', note: 'Vir de kimono branco', closesAcademy: false },
  ];
  for (const evento of eventos) {
    await calendar.upsertEvent(evento, now);
  }

  console.log('UPSTASH_REDIS_REST_URL=' + url);
  console.log('UPSTASH_REDIS_REST_TOKEN=' + token);
  console.log(KIDS.length + ' crianças, ' + ADULTOS.length + ' adultos, 2 pendentes, 5 eventos.');

  await new Promise(() => {});
}

void main();
