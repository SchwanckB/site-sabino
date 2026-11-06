import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BeltDisplay } from '@/components/app/BeltDisplay';
import { weekdayLabels, type Weekday } from '@/data/seed';
import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/roles';
import { DOCUMENT_KIND_SHORT } from '@/lib/documentRules';
import { countCheckins, listCheckins } from '@/lib/repositories/attendance';
import { listGraduationHistory } from '@/lib/repositories/graduation';
import { buildTimeline, formatSpan } from '@/utils/graduationTimeline';
import { getPaymentPlan, listPaymentHistory } from '@/lib/repositories/payments';
import { getStudent, toPublicStudent } from '@/lib/repositories/students';
import { getSchedule } from '@/lib/schedule';
import { cn } from '@/lib/utils';
import {
  CHECKIN_SOURCE_LABELS,
  PAYMENT_METHOD_LABELS,
  STATUS_LABELS,
  type PaymentMethod,
} from '@/types/domain';
import { daysBetween, formatBr, saoPauloDateString } from '@/utils/datetime';
import { formatCents, getPaymentSummary, PLAN_LABELS } from '@/utils/paymentEngine';

import type { ClassOption } from '../../ClassPicker';
import { DeleteStudentForm } from './DeleteStudentForm';
import { StudentEditor } from './StudentEditor';

export const metadata: Metadata = { title: 'Ficha do aluno' };
export const dynamic = 'force-dynamic';

export default async function AlunoPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const admin = await requirePermission('alunos');

  const { id } = await params;
  const student = await getStudent(id);
  if (!student) notFound();

  /*
   * O que esta ficha mostra depende de quem abriu.
   *
   * O professor cuida de turmas, faixa e graus — e não vê mensalidade nem
   * pagamentos, que é o mesmo recorte da Visão geral. Mudar a situação do
   * cadastro e apagar a ficha mexem na cobrança e não têm desfazer: ficam com
   * a gestão.
   */
  const verDinheiro = can(admin.role, 'dinheiro');
  const podeMatricula = can(admin.role, 'matricula');

  const now = new Date();

  const [schedule, plan, checkins, total, graduations, payments] = await Promise.all([
    getSchedule(),
    // Sem permissão de dinheiro a leitura também não acontece: não é só a
    // seção que desaparece da tela, o dado não chega ao navegador.
    verDinheiro ? getPaymentPlan(student.id) : null,
    listCheckins(student.id, 120),
    countCheckins(student.id),
    listGraduationHistory(student.id, 20),
    verDinheiro ? listPaymentHistory(student.id, 12) : [],
  ]);

  // A lista crua de datas vira tempo por faixa e intervalo entre graus.
  const timeline = buildTimeline(graduations, student.joinedAt, now);

  /*
   * De quem esta ficha pendura, quando ela não tem login próprio.
   *
   * O pai cadastrou o filho pela conta dele. Sem esta linha, a ficha da
   * criança parece um cadastro órfão: sem e-mail de verdade, sem documento, e
   * ninguém a quem perguntar. É também o que explica por que ela não aparece
   * na tela de Contas.
   */
  const responsavel = student.guardianUserId
    ? await getStudent(student.guardianUserId)
    : null;

  const publicStudent = toPublicStudent(student, now);
  const isKids = student.category === 'kids';
  const summary = plan ? getPaymentSummary(plan, now) : null;

  const today = saoPauloDateString(now);
  const last90 = checkins.filter((entry) => daysBetween(today, entry.date) < 90).length;

  const classOptions: ClassOption[] = schedule.classes.map((slot) => ({
    id: slot.id,
    label: `${slot.title} · ${slot.level}`,
    weekday: `${weekdayLabels[slot.weekday as Weekday]}, ${slot.startTime} às ${slot.endTime}`,
    unit: slot.unit,
    modality: slot.modality,
    teacher: slot.teacher ?? '',
  }));

  return (
    <div>
      <nav aria-label="Trilha" className="text-sm text-muted">
        <Link href="/admin/alunos" className="hover:text-foreground">
          Alunos
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-foreground">{student.name}</span>
      </nav>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl leading-none sm:text-4xl">{student.name}</h1>
          <p className="mt-2 text-sm text-muted">
            {publicStudent.age} anos · {isKids ? 'Infantil' : 'Adulto'} ·{' '}
            {STATUS_LABELS[student.status]}
          </p>
        </div>
        <BeltDisplay
          belt={student.belt}
          degree={student.degree}
          isKids={isKids}
          className="max-w-[200px]"
        />
      </header>

      {/* Dados pessoais --------------------------------------------------- */}
      <section className="panel mt-8 p-5 sm:p-6">
        <h2 className="text-lg normal-case tracking-normal">Dados do cadastro</h2>

        <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">E-mail</dt>
            <dd className="mt-0.5 break-words text-foreground">{student.email}</dd>
          </div>
          {student.guardianUserId ? (
            <div>
              <dt className="text-xs text-muted">Cadastrado por</dt>
              <dd className="mt-0.5 text-foreground">
                {responsavel ? (
                  <Link
                    href={`/admin/alunos/${responsavel.id}`}
                    className="hover:text-crimson"
                  >
                    {responsavel.name}
                  </Link>
                ) : (
                  'Conta não encontrada'
                )}
                <span className="block text-xs text-muted">
                  Sem login próprio — usa a conta de quem cadastrou
                </span>
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs text-muted">Telefone</dt>
            <dd className="mt-0.5 text-foreground">{student.phone}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">CPF</dt>
            <dd className="mt-0.5 font-mono text-foreground">{publicStudent.cpfMasked}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Nascimento</dt>
            <dd className="mt-0.5 text-foreground">{formatBr(student.birthDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Matriculado em</dt>
            <dd className="mt-0.5 text-foreground">
              {student.joinedAt ? formatBr(student.joinedAt.slice(0, 10)) : '--'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Última graduação</dt>
            <dd className="mt-0.5 text-foreground">
              {student.lastGraduationAt ? formatBr(student.lastGraduationAt.slice(0, 10)) : '--'}
            </dd>
          </div>
          {student.guardianName ? (
            <>
              <div>
                <dt className="text-xs text-muted">Responsável</dt>
                <dd className="mt-0.5 text-foreground">{student.guardianName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Telefone do responsável</dt>
                <dd className="mt-0.5 text-foreground">{student.guardianPhone ?? '--'}</dd>
              </div>
            </>
          ) : null}
        </dl>

        {publicStudent.hasDocument ? (
          <a
            href={`/api/admin/documento/${student.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary mt-5"
          >
            Abrir {DOCUMENT_KIND_SHORT[publicStudent.docKind].toLowerCase()}
          </a>
        ) : (
          <p className="mt-5 text-xs text-crimson">Sem arquivo anexado.</p>
        )}
      </section>

      {/* Resumo rápido ----------------------------------------------------- */}
      <div
        className={cn(
          'mt-6 grid gap-4',
          verDinheiro ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
        )}
      >
        <div className="panel p-4">
          <p className="text-xs text-muted">Total de treinos</p>
          <p className="mt-1 font-display text-3xl leading-none tabular-nums text-crimson">
            {total}
          </p>
        </div>
        <div className="panel p-4">
          <p className="text-xs text-muted">Últimos 90 dias</p>
          <p className="mt-1 font-display text-3xl leading-none tabular-nums">{last90}</p>
        </div>
        {verDinheiro ? (
          <div
            className={cn(
              'rounded-2xl border p-4 backdrop-blur-md',
              summary?.status === 'vencida'
                ? 'border-crimson/40 bg-crimson/[.06]'
                : summary?.status === 'vence_em_breve'
                  ? 'border-amber-500/30 bg-amber-500/[.05]'
                  : 'border-hairline bg-white/[.04]',
            )}
          >
            <p className="text-xs text-muted">Mensalidade</p>
            {summary ? (
              <>
                <p className="mt-1 font-display text-xl leading-none">
                  {formatCents(summary.amountCents)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {summary.planName ? `${summary.planName} · ` : ''}
                  {PLAN_LABELS[summary.planId]} · vence {formatBr(summary.dueDate)}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">Não definida</p>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-6">
        <StudentEditor
          studentId={student.id}
          name={student.name}
          joinedAt={student.joinedAt ? student.joinedAt.slice(0, 10) : ''}
          lastGraduationAt={
            student.lastGraduationAt ? student.lastGraduationAt.slice(0, 10) : ''
          }
          today={today}
          belt={student.belt}
          degree={student.degree}
          notes={student.notes}
          status={student.status}
          gender={student.gender}
          unit={student.unit}
          graduatesMonthly={student.graduatesMonthly}
          isKids={isKids}
          assignedClassIds={student.classIds}
          classOptions={classOptions}
          canChangeStatus={podeMatricula}
        />
      </div>

      {/* Históricos --------------------------------------------------------- */}
      <div
        className={cn('mt-6 grid gap-6', verDinheiro ? 'lg:grid-cols-3' : 'lg:grid-cols-2')}
      >
        <section className="panel p-5 sm:p-6">
          <h2 className="text-lg normal-case tracking-normal">Graduações</h2>
          {timeline.daysSinceLast !== null ? (
            <p className="mt-1 text-xs text-muted">
              Última há {formatSpan(timeline.daysSinceLast)}.
            </p>
          ) : null}

          {timeline.belts.length > 0 ? (
            <ul className="mt-4 space-y-1.5">
              {timeline.belts.map((spell) => (
                <li
                  key={spell.belt + spell.from}
                  className="flex items-baseline justify-between gap-3 text-xs"
                >
                  <span className="capitalize text-foreground">
                    {spell.belt}
                    {spell.to === null ? ' (atual)' : ''}
                  </span>
                  <span className="shrink-0 text-muted">
                    {formatSpan(spell.days)}
                    {spell.degreesEarned > 0
                      ? ` · ${spell.degreesEarned} ${spell.degreesEarned === 1 ? 'grau' : 'graus'}`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {timeline.entries.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nenhuma graduação registrada.</p>
          ) : (
            <ul className="mt-4 divide-y divide-hairline border-t border-hairline text-sm">
              {timeline.entries.map((entry) => (
                <li key={entry.at} className="flex items-baseline justify-between gap-3 py-3">
                  <span>
                    <span className="block text-foreground">
                      {entry.isBeltChange
                        ? `Faixa ${entry.toBelt}`
                        : `Grau ${entry.toDegree}`}
                    </span>
                    <span className="block text-xs text-muted">
                      {formatBr(entry.at.slice(0, 10))}
                    </span>
                  </span>
                  {entry.daysSincePrevious !== null ? (
                    <span className="shrink-0 text-xs text-muted">
                      +{formatSpan(entry.daysSincePrevious)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {verDinheiro ? (
          <section className="panel p-5 sm:p-6">
            <h2 className="text-lg normal-case tracking-normal">Pagamentos</h2>
            {payments.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Nenhum pagamento registrado.</p>
            ) : (
              <ul className="mt-4 divide-y divide-hairline text-sm">
                {payments.map((entry) => (
                  <li key={entry.paidAt} className="flex justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-foreground">{formatCents(entry.amountCents)}</p>
                      <p className="text-xs text-muted">
                        ref. {entry.referenceMonth} ·{' '}
                        {PAYMENT_METHOD_LABELS[entry.method as PaymentMethod] ?? entry.method}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {formatBr(entry.paidAt.slice(0, 10))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <section className="panel p-5 sm:p-6">
          <h2 className="text-lg normal-case tracking-normal">Últimas presenças</h2>
          {checkins.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nenhuma presença registrada.</p>
          ) : (
            <ul className="mt-4 divide-y divide-hairline text-sm">
              {checkins.slice(0, 10).map((entry) => (
                <li key={entry.at} className="flex justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-foreground">{entry.classTitle ?? 'Treino'}</p>
                    <p className="text-xs text-muted">
                      {CHECKIN_SOURCE_LABELS[entry.source]}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {formatBr(entry.date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/*
        Exclusão definitiva.

        Fica no fim da página, separada e em vermelho, porque não tem desfazer.
        Para quem apenas parou de treinar existe o status "inativo", logo acima
        — e o texto diz isso, senão o botão vira o caminho fácil para resolver
        "esse aluno não treina mais".
      */}
      {podeMatricula ? (
      <section className="mt-10 rounded-2xl border border-crimson/40 bg-crimson/[.05] p-5 sm:p-6">
        <h2 className="text-lg normal-case tracking-normal text-crimson">Apagar cadastro</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Remove em definitivo a ficha, o histórico de presenças e graduações, a mensalidade,
          o arquivo anexado e a conta de login. <strong className="text-foreground">Não
          tem como desfazer.</strong>
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Se o aluno só parou de treinar, marque como <strong className="text-foreground">
          inativo</strong> ali em cima: ele some das listas e da cobrança, mas o histórico fica
          guardado caso volte.
        </p>

        <DeleteStudentForm studentId={student.id} studentName={student.name} />
      </section>
      ) : null}
    </div>
  );
}
