import { NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';
import { listCheckins } from '@/lib/repositories/attendance';
import { listCashEntriesRange } from '@/lib/repositories/cashbook';
import { listPaymentHistory, getPaymentPlans } from '@/lib/repositories/payments';
import { listAllStudents } from '@/lib/repositories/students';
import { getUnitScope } from '@/lib/unitScope';
import {
  PAYMENT_METHOD_LABELS,
  STATUS_LABELS,
  UNIT_LABELS,
  filterByUnit,
  type PaymentMethod,
} from '@/types/domain';
import { categoryLabel } from '@/utils/cashbook';
import { buildCsv, csvCents, csvFilename } from '@/utils/csv';
import { addMonths, formatBr, saoPauloDateString, saoPauloTimeString } from '@/utils/datetime';
import { calculateAge } from '@/utils/graduationEngine';
import { getPaymentSummary } from '@/utils/paymentEngine';

/**
 * Exportação em CSV: alunos, presenças e financeiro.
 *
 * Existe para que os dados não vivam só dentro do sistema — o contador pede
 * planilha, e ter uma cópia fora do Redis é o backup mais simples que há.
 *
 * Segue o recorte de academia escolhido no painel, como todas as telas: quem
 * está vendo Terra de Areia exporta Terra de Areia.
 *
 * **Nunca inclui CPF nem link de documento.** Uma planilha circula por
 * e-mail e WhatsApp sem controle; o que a academia precisa para gestão não
 * depende de carregar o documento de identidade de ninguém junto.
 */

export const dynamic = 'force-dynamic';

const TIPOS = ['alunos', 'presencas', 'financeiro', 'caixa'] as const;
type Tipo = (typeof TIPOS)[number];

function isTipo(value: string): value is Tipo {
  return (TIPOS as readonly string[]).includes(value);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tipo: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser();
  // A planilha é a tela de relatórios por outro caminho: a URL é adivinhável,
  // e sem esta checagem o professor baixaria o financeiro que o menu esconde.
  if (!user || !can(user.role, 'relatorios')) {
    return new NextResponse('Não encontrado', { status: 404 });
  }

  const { tipo } = await params;
  if (!isTipo(tipo)) {
    return new NextResponse('Não encontrado', { status: 404 });
  }

  const now = new Date();
  const hoje = saoPauloDateString(now);
  const scope = await getUnitScope();
  const students = filterByUnit(await listAllStudents(), scope);

  /*
   * Período, quando vem na URL.
   *
   * A planilha saía sempre inteira, e inteira ela não serve para o contador:
   * ele pede um mês. Fora de faixa, o comportamento é o de antes — tudo.
   */
  const url = new URL(request.url);
  const de = url.searchParams.get('de') ?? '';
  const ate = url.searchParams.get('ate') ?? '';
  const periodo = {
    de: DATE_ONLY.test(de) ? de : null,
    ate: DATE_ONLY.test(ate) ? ate : null,
  };

  const csv =
    tipo === 'alunos'
      ? csvAlunos(students, now)
      : tipo === 'presencas'
        ? await csvPresencas(students, periodo)
        : tipo === 'caixa'
          ? await csvCaixa(periodo, hoje)
          : await csvFinanceiro(students, now);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename(tipo, hoje)}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/* -------------------------------------------------------------------------- */

type Student = Awaited<ReturnType<typeof listAllStudents>>[number];

function csvAlunos(students: readonly Student[], now: Date): string {
  return buildCsv(
    [
      'Nome',
      'Academia',
      'Situação',
      'Categoria',
      'Sexo',
      'Idade',
      'Nascimento',
      'Faixa',
      'Graus',
      'Matrícula',
      'Última graduação',
      'E-mail',
      'Telefone',
      'Responsável',
      'Telefone do responsável',
      'Turmas',
      'Observações',
    ],
    students.map((s) => [
      s.name,
      UNIT_LABELS[s.unit],
      STATUS_LABELS[s.status],
      s.category === 'kids' ? 'Infantil' : 'Adulto',
      s.gender,
      s.birthDate ? calculateAge(s.birthDate, now) : '',
      formatBr(s.birthDate),
      s.belt,
      s.degree,
      s.joinedAt ? formatBr(s.joinedAt.slice(0, 10)) : '',
      s.lastGraduationAt ? formatBr(s.lastGraduationAt.slice(0, 10)) : '',
      s.email,
      s.phone,
      s.guardianName ?? '',
      s.guardianPhone ?? '',
      s.classIds.length,
      s.notes,
    ]),
  );
}

/**
 * Quantos alunos são consultados por vez.
 *
 * O histórico era lido aluno por aluno, em série: com duzentas fichas isso
 * virava duzentas idas ao Redis esperando uma à outra, e a exportação estourava
 * o tempo da função antes de devolver o arquivo. Em lotes, as leituras de cada
 * lote saem em paralelo; o lote existe para não abrir duzentas conexões de uma
 * vez e trocar o timeout por uma recusa do Redis.
 */
const LOTE_HISTORICO = 25;

async function emLotes<T, R>(
  items: readonly T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

interface Periodo {
  readonly de: string | null;
  readonly ate: string | null;
}

const DATE_ONLY = /^d{4}-d{2}-d{2}$/;

/**  se a data civil cai dentro do período pedido. */
function noPeriodo(date: string, periodo: Periodo): boolean {
  if (periodo.de !== null && date < periodo.de) return false;
  if (periodo.ate !== null && date > periodo.ate) return false;
  return true;
}

async function csvPresencas(
  students: readonly Student[],
  periodo: Periodo,
): Promise<string> {
  const linhas: unknown[][] = [];

  // 400 entradas cobrem mais de um ano de treino cinco vezes por semana.
  const historicos = await emLotes(students, LOTE_HISTORICO, async (student) => ({
    student,
    checkins: await listCheckins(student.id, 400),
  }));

  for (const { student, checkins } of historicos) {
    for (const entry of checkins) {
      if (!noPeriodo(entry.date, periodo)) continue;
      linhas.push([
        formatBr(entry.date),
        student.name,
        UNIT_LABELS[student.unit],
        entry.classTitle ?? '',
        saoPauloTimeString(entry.at),
        entry.source,
      ]);
    }
  }

  // Mais recente primeiro, como o professor lê.
  linhas.sort((a, b) => String(b[0]).localeCompare(String(a[0])));

  return buildCsv(['Data', 'Aluno', 'Academia', 'Turma', 'Hora', 'Origem'], linhas);
}

async function csvFinanceiro(students: readonly Student[], now: Date): Promise<string> {
  const plans = await getPaymentPlans(students.map((s) => s.id));
  const linhas: unknown[][] = [];

  // Mesmo motivo do CSV de presenças: um `listPaymentHistory` por aluno em
  // série não termina numa academia grande.
  const historicos = await emLotes(students, LOTE_HISTORICO, async (student) => ({
    student,
    historico: await listPaymentHistory(student.id, 60),
  }));

  for (const { student, historico } of historicos) {
    const plan = plans.get(student.id);
    const summary = plan ? getPaymentSummary(plan, now) : null;

    if (historico.length === 0) {
      // Aluno sem lançamento ainda entra na planilha: é justamente quem o
      // professor procura ao conferir a inadimplência.
      linhas.push([
        student.name,
        UNIT_LABELS[student.unit],
        '',
        '',
        '',
        summary ? formatBr(summary.dueDate) : '',
        summary ? summary.status : 'sem mensalidade',
        summary ? csvCents(summary.totalOpenCents) : '',
      ]);
      continue;
    }

    for (const entry of historico) {
      linhas.push([
        student.name,
        UNIT_LABELS[student.unit],
        formatBr(entry.paidAt.slice(0, 10)),
        csvCents(entry.amountCents),
        PAYMENT_METHOD_LABELS[entry.method as PaymentMethod] ?? entry.method,
        summary ? formatBr(summary.dueDate) : '',
        summary ? summary.status : '',
        summary ? csvCents(summary.totalOpenCents) : '',
      ]);
    }
  }

  return buildCsv(
    [
      'Aluno',
      'Academia',
      'Pago em',
      'Valor pago',
      'Forma',
      'Próximo vencimento',
      'Situação atual',
      'Em aberto',
    ],
    linhas,
  );
}

/**
 * Livro-caixa do período: o que entrou, o que saiu, por categoria.
 *
 * Não segue o recorte de academia das outras planilhas, e sim a unidade de
 * cada lançamento — uma despesa de rede (contador, anúncio) não pertence a
 * nenhuma das duas, e somá-la a uma delas distorceria o resultado da outra.
 * A coluna "Academia" deixa isso explícito para quem abrir o arquivo.
 */
async function csvCaixa(periodo: Periodo, hoje: string): Promise<string> {
  const inicio = (periodo.de ?? hoje).slice(0, 7);
  const fim = (periodo.ate ?? hoje).slice(0, 7);

  // Meses do intervalo, com teto de dois anos: o CSV é para o contador, não
  // para varrer a história inteira da academia num pedido só.
  const meses: string[] = [];
  let cursor = inicio;
  for (let guarda = 0; guarda < 24 && cursor <= fim; guarda += 1) {
    meses.push(cursor);
    cursor = addMonths(`${cursor}-01`, 1).slice(0, 7);
  }

  const entries = (await listCashEntriesRange(meses)).filter((entry) =>
    noPeriodo(entry.date, periodo),
  );

  return buildCsv(
    ['Data', 'Tipo', 'Categoria', 'Descrição', 'Academia', 'Valor'],
    entries
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((entry) => [
        formatBr(entry.date),
        entry.kind === 'despesa' ? 'Saída' : 'Entrada',
        categoryLabel(entry.kind, entry.category),
        entry.description,
        entry.unit === 'rede' ? 'Rede' : UNIT_LABELS[entry.unit],
        // Saída com sinal negativo: a soma da coluna no Excel já dá o
        // resultado do período, sem o contador precisar separar as linhas.
        csvCents(entry.kind === 'despesa' ? -entry.amountCents : entry.amountCents),
      ]),
  );
}
