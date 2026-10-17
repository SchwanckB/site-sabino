import type { Metadata } from 'next';

import { weekdayShortLabels, type Weekday } from '@/data/seed';
import { listCheckins } from '@/lib/repositories/attendance';
import { listStudentsByStatus } from '@/lib/repositories/students';
import { getSchedule } from '@/lib/schedule';
import { getUnitScope } from '@/lib/unitScope';
import { UNIT_SCOPE_LABELS, UNIT_SHORT, filterByUnit } from '@/types/domain';
import {
  REPORT_WINDOW_DAYS,
  buildClassReport,
  type ReportCheckin,
  type ReportClass,
} from '@/utils/classReport';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Relatórios' };
export const dynamic = 'force-dynamic';

const EXPORTS: readonly { tipo: string; label: string; hint: string }[] = [
  { tipo: 'alunos', label: 'Alunos', hint: 'Cadastro, faixa, turmas e observações' },
  { tipo: 'presencas', label: 'Presenças', hint: 'Todos os check-ins, por data e turma' },
  { tipo: 'financeiro', label: 'Financeiro', hint: 'Pagamentos lançados e o que está em aberto' },
];

export default async function RelatoriosPage() {
  const now = new Date();
  const scope = await getUnitScope();

  const [schedule, todos] = await Promise.all([getSchedule(), listStudentsByStatus('ativo')]);

  const students = filterByUnit(todos, scope);
  const classes = filterByUnit(schedule.classes, scope);

  const historicos = await Promise.all(
    students.map(async (student) => ({
      id: student.id,
      entries: await listCheckins(student.id, 200),
    })),
  );

  const checkins: ReportCheckin[] = historicos.flatMap((h) =>
    h.entries.map((entry) => ({
      studentId: h.id,
      date: entry.date,
      classId: entry.classId,
    })),
  );

  const reportClasses: ReportClass[] = classes.map((slot) => ({
    id: slot.id,
    label:
      `${weekdayShortLabels[slot.weekday as Weekday]} ${slot.startTime} · ${slot.title}` +
      (scope === 'todas' ? ` · ${UNIT_SHORT[slot.unit]}` : ''),
    weekday: slot.weekday,
    startTime: slot.startTime,
  }));

  const report = buildClassReport(
    reportClasses,
    students.map((s) => ({ id: s.id, classIds: s.classIds })),
    checkins,
    now,
  );

  return (
    <div>
      <header>
        <p className="eyebrow">Números</p>
        <h1 className="mt-2 text-3xl leading-none sm:text-4xl">Relatórios</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Tudo aqui segue a academia escolhida no topo da página — agora,{' '}
          <strong className="text-foreground">{UNIT_SCOPE_LABELS[scope]}</strong>.
        </p>
      </header>

      {/* Exportação ------------------------------------------------------- */}
      <section className="surface-card mt-8 p-5 sm:p-6">
        <h2 className="text-lg normal-case tracking-normal">Baixar planilha</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Abre direto no Excel. Serve para o contador e para ter uma cópia dos dados fora do
          sistema. Por segurança, CPF e documentos não entram na planilha.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {EXPORTS.map((item) => (
            <a
              key={item.tipo}
              href={`/api/admin/exportar/${item.tipo}`}
              className="flex min-h-[44px] flex-col justify-center rounded-xl border border-hairline bg-white/[.04] p-4 transition-colors hover:border-white/25"
            >
              <span className="text-sm font-medium text-foreground">{item.label}</span>
              <span className="mt-1 text-xs leading-snug text-muted">{item.hint}</span>
            </a>
          ))}
        </div>
      </section>

      {/* Turmas ------------------------------------------------------------ */}
      <section className="surface-card mt-4 p-5 sm:p-6">
        <h2 className="text-lg normal-case tracking-normal">Frequência por turma</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Últimos {REPORT_WINDOW_DAYS} dias, comparados com os {REPORT_WINDOW_DAYS} anteriores. A
          lista de alunos mostra quem parou; isto mostra o horário que está esvaziando.
        </p>

        {report.length === 0 ? (
          <p className="mt-5 text-sm text-muted">
            Nenhuma turma cadastrada nesta academia. Monte a grade em Horários.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-hairline">
            {report.map((row) => (
              <li key={row.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {row.label}
                  </p>

                  {row.trend !== null ? (
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
                        row.trend > 0.05
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : row.trend < -0.15
                            ? 'bg-crimson/15 text-crimson'
                            : 'bg-white/[.07] text-muted',
                      )}
                    >
                      {row.trend > 0 ? '+' : ''}
                      {Math.round(row.trend * 100)}%
                    </span>
                  ) : (
                    <span className="shrink-0 text-[11px] text-muted">sem base anterior</span>
                  )}
                </div>

                <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                  <div className="flex gap-1.5">
                    <dt>Matriculados</dt>
                    <dd className="tabular-nums text-foreground">{row.enrolled}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt>Presenças</dt>
                    <dd className="tabular-nums text-foreground">{row.recent}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt>Alunos distintos</dt>
                    <dd className="tabular-nums text-foreground">{row.activeStudents}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt>Média por aula</dt>
                    <dd className="tabular-nums text-foreground">
                      {row.averagePerSession.toFixed(1)}
                    </dd>
                  </div>
                </dl>

                {row.enrolled > 0 ? (
                  <div
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[.07]"
                    role="presentation"
                  >
                    <div
                      className={cn(
                        'h-full rounded-full',
                        row.activeStudents / row.enrolled >= 0.6 ? 'bg-emerald-400' : 'bg-crimson',
                      )}
                      style={{
                        width: `${Math.min(100, Math.round((row.activeStudents / row.enrolled) * 100))}%`,
                      }}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
