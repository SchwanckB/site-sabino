import { NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/auth';
import { listCheckins } from '@/lib/repositories/attendance';
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
import { buildCsv, csvCents, csvFilename } from '@/utils/csv';
import { formatBr, saoPauloDateString } from '@/utils/datetime';
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

const TIPOS = ['alunos', 'presencas', 'financeiro'] as const;
type Tipo = (typeof TIPOS)[number];

function isTipo(value: string): value is Tipo {
  return (TIPOS as readonly string[]).includes(value);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tipo: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'ADMIN') {
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

  const csv =
    tipo === 'alunos'
      ? csvAlunos(students, now)
      : tipo === 'presencas'
        ? await csvPresencas(students)
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

async function csvPresencas(students: readonly Student[]): Promise<string> {
  const linhas: unknown[][] = [];

  for (const student of students) {
    // 400 entradas cobrem mais de um ano de treino cinco vezes por semana.
    const checkins = await listCheckins(student.id, 400);
    for (const entry of checkins) {
      linhas.push([
        formatBr(entry.date),
        student.name,
        UNIT_LABELS[student.unit],
        entry.classTitle ?? '',
        entry.at.slice(11, 16),
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

  for (const student of students) {
    const plan = plans.get(student.id);
    const summary = plan ? getPaymentSummary(plan, now) : null;
    const historico = await listPaymentHistory(student.id, 60);

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
