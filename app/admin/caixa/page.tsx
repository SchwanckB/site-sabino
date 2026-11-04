import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { PageHeader, Stat, StatStrip } from '@/components/app/PageHeader';

import { requirePermission } from '@/lib/auth';
import {
  isMonth,
  listCashEntries,
  listClosedMonths,
  listRecurringCosts,
} from '@/lib/repositories/cashbook';
import { getPaymentPlans, listPaymentHistory } from '@/lib/repositories/payments';
import { listStudentsByStatus } from '@/lib/repositories/students';
import { cn } from '@/lib/utils';
import { filterByUnit } from '@/types/domain';
import { getUnitScope } from '@/lib/unitScope';
import {
  categoryLabel,
  marginPercent,
  summarizeCashbook,
  type CashItem,
} from '@/utils/cashbook';
import { addMonths, saoPauloDateString } from '@/utils/datetime';
import {
  FORECAST_MONTHS,
  forecastMonths,
  type ForecastPlan,
} from '@/utils/financeForecast';
import { formatCents, installmentCents } from '@/utils/paymentEngine';

import { postRecurringAction, setMonthClosedAction } from '../actions';
import { CashbookScreen, type CashRow, type RecurringRow } from './CashbookScreen';

export const metadata: Metadata = { title: 'Caixa' };
export const dynamic = 'force-dynamic';

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

function monthLabel(month: string): string {
  const [ano, mes] = month.split('-');
  return `${MESES[Number(mes) - 1] ?? month} de ${ano}`;
}

function shortMonth(month: string): string {
  const [, mes] = month.split('-');
  return (MESES[Number(mes) - 1] ?? month).slice(0, 3);
}

/**
 * Livro-caixa da academia.
 *
 * O financeiro responde por aluno; esta tela responde pela academia. É aqui
 * que a despesa existe, e por isso é aqui que "sobrou quanto" passa a ter
 * resposta — a pergunta que o fechamento do mês não conseguia responder
 * enquanto o sistema só conhecia entrada de mensalidade.
 */
export default async function CaixaPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ mes?: string }>;
}) {
  await requirePermission('dinheiro');

  const now = new Date();
  const hoje = saoPauloDateString(now);
  const { mes } = await searchParams;

  const month = mes !== undefined && isMonth(mes) ? mes : hoje.slice(0, 7);
  const anterior = addMonths(`${month}-01`, -1).slice(0, 7);
  const proximo = addMonths(`${month}-01`, 1).slice(0, 7);

  const scope = await getUnitScope();

  const [entries, recurring, fechados, ativos] = await Promise.all([
    listCashEntries(month),
    listRecurringCosts(),
    listClosedMonths(),
    listStudentsByStatus('ativo'),
  ]);

  /*
   * Mensalidade recebida no mês.
   *
   * Vem do histórico de pagamento de cada aluno, e não do caixa: a
   * mensalidade já tem motor, índice e histórico próprios, e duplicá-la aqui
   * criaria duas verdades sobre o mesmo dinheiro. O caixa soma as duas fontes
   * só na hora de apresentar.
   */
  const alunos = filterByUnit(ativos, scope);
  const historicos = await Promise.all(
    alunos.map((student) => listPaymentHistory(student.id, 36)),
  );

  const tuitionCents = historicos
    .flat()
    .filter((entry) => saoPauloDateString(new Date(entry.paidAt)).slice(0, 7) === month)
    .reduce((soma, entry) => soma + entry.amountCents, 0);

  const items: CashItem[] = entries.map((entry) => ({
    kind: entry.kind,
    date: entry.date,
    amountCents: entry.amountCents,
    category: entry.category,
  }));

  const resumo = summarizeCashbook(items, month, tuitionCents);
  const margem = marginPercent(resumo);
  const closed = fechados.includes(month);

  // Previsão: parcelas a vencer contra as contas fixas de saída.
  const plans = await getPaymentPlans(alunos.map((student) => student.id));
  const forecastPlans: ForecastPlan[] = [...plans.values()].map((plan) => ({
    planId: plan.planId,
    amountCents: installmentCents(plan),
    dueDate: plan.dueDate,
    dueDay: plan.dueDay,
  }));

  const fixas = recurring
    .filter((item) => item.kind === 'despesa')
    .map((item) => ({ amountCents: item.amountCents }));

  const previsao = forecastMonths(forecastPlans, fixas, hoje.slice(0, 7), FORECAST_MONTHS);

  const rows: CashRow[] = entries.map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    date: entry.date,
    amountCents: entry.amountCents,
    category: entry.category,
    categoryLabel: categoryLabel(entry.kind, entry.category),
    description: entry.description,
    unit: entry.unit,
  }));

  const recurringRows: RecurringRow[] = recurring.map((item) => ({
    id: item.id,
    kind: item.kind,
    amountCents: item.amountCents,
    category: item.category,
    categoryLabel: categoryLabel(item.kind, item.category),
    description: item.description,
    unit: item.unit,
    dueDay: item.dueDay,
  }));

  return (
    <div className="page-stack">
      <PageHeader
        title="Caixa"
        meta={monthLabel(month)}
        actions={
          <>
            <Link href={`/admin/caixa?mes=${anterior}`} className="btn-secondary text-sm">
              ← {shortMonth(anterior)}
            </Link>
            {proximo <= hoje.slice(0, 7) ? (
              <Link href={`/admin/caixa?mes=${proximo}`} className="btn-secondary text-sm">
                {shortMonth(proximo)} →
              </Link>
            ) : null}
            <a
              href={`/api/admin/exportar/caixa?de=${month}-01&ate=${month}-31`}
              className="btn-ghost text-sm"
            >
              Baixar planilha
            </a>
          </>
        }
      />

      <StatStrip>
        <Stat
          label="Entrou no mês"
          value={formatCents(resumo.totalInCents)}
          tone="destaque"
          hint={`${formatCents(resumo.tuitionCents)} de mensalidade`}
        />
        <Stat
          label="Saiu no mês"
          value={formatCents(resumo.expenseCents)}
          tone={resumo.expenseCents > 0 ? 'alerta' : 'neutro'}
          hint={`${resumo.entryCount} ${resumo.entryCount === 1 ? 'lançamento' : 'lançamentos'}`}
        />
        <Stat
          label="Sobrou"
          value={formatCents(resumo.resultCents)}
          tone={resumo.resultCents >= 0 ? 'bom' : 'alerta'}
          {...(margem !== null ? { hint: `margem de ${margem}%` } : {})}
        />
        <Stat
          label="Outras entradas"
          value={formatCents(resumo.incomeCents)}
          hint="matrícula, kimono, eventos"
        />
      </StatStrip>

      {/* Ações do mês ------------------------------------------------------ */}
      <div className="panel panel-pad flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="panel-title">{closed ? 'Mês fechado' : 'Fechamento'}</p>
          <p className="mt-1.5 max-w-prose text-sm text-muted">
            {closed
              ? 'Este mês não aceita mais lançamento. É o que garante que o número usado para decidir algo não mude depois.'
              : 'Feche o mês quando terminar de conferir. Depois disso, lançar nele exige reabrir — e nenhuma comparação entre meses muda sozinha.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!closed && recurringRows.length > 0 ? (
            <ActionForm action={postRecurringAction}>
              <input type="hidden" name="month" value={month} />
              <SubmitButton className="btn-secondary text-sm" pendingLabel="Lançando…">
                Lançar contas fixas
              </SubmitButton>
            </ActionForm>
          ) : null}

          <ActionForm
            action={setMonthClosedAction}
            confirm={
              closed
                ? `Reabrir ${monthLabel(month)} para lançamento?`
                : `Fechar ${monthLabel(month)}? Novos lançamentos ficam bloqueados até reabrir.`
            }
          >
            <input type="hidden" name="month" value={month} />
            {!closed ? <input type="hidden" name="close" value="on" /> : null}
            <SubmitButton
              className={closed ? 'btn-secondary text-sm' : 'btn-primary text-sm'}
              pendingLabel="…"
            >
              {closed ? 'Reabrir o mês' : 'Fechar o mês'}
            </SubmitButton>
          </ActionForm>
        </div>
      </div>

      {/* Por categoria ----------------------------------------------------- */}
      {resumo.byExpenseCategory.length > 0 ? (
        <section className="panel panel-pad">
          <p className="panel-title">Para onde foi o dinheiro</p>
          <ul className="mt-3 space-y-2">
            {resumo.byExpenseCategory.map((item) => {
              const pct =
                resumo.expenseCents > 0
                  ? Math.round((item.cents / resumo.expenseCents) * 100)
                  : 0;

              return (
                <li key={item.category}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-foreground">{item.label}</span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {formatCents(item.cents)}
                      <span className="ml-2 text-xs">{pct}%</span>
                    </span>
                  </div>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/[.07]">
                    <span
                      className="block h-full rounded-full bg-crimson"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Previsão ---------------------------------------------------------- */}
      <section className="panel panel-pad">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="panel-title">Previsão dos próximos meses</p>
          <span className="text-[11px] text-muted">mensalidades a vencer × contas fixas</span>
        </div>

        <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-muted">
          Quem paga trimestral ou anual não paga nos meses seguintes. Sem esta leitura, o mês
          magro só aparece quando chega.
        </p>

        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {previsao.map((item) => (
            <li key={item.month} className="rounded-xl border border-hairline bg-white/[.03] p-3">
              <p className="text-xs uppercase tracking-[0.08em] text-muted">
                {monthLabel(item.month)}
              </p>
              <p className="mt-1 font-display text-lg tabular-nums text-foreground">
                {formatCents(item.expectedTuitionCents)}
              </p>
              <p className="text-[11px] text-muted">
                {item.installments}{' '}
                {item.installments === 1 ? 'parcela a vencer' : 'parcelas a vencer'}
              </p>
              {item.fixedCostCents > 0 ? (
                <p
                  className={cn(
                    'mt-1.5 text-xs tabular-nums',
                    item.projectedResultCents >= 0 ? 'text-emerald-300' : 'text-crimson',
                  )}
                >
                  sobra prevista {formatCents(item.projectedResultCents)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <CashbookScreen
        month={month}
        today={hoje}
        entries={rows}
        recurring={recurringRows}
        closed={closed}
      />
    </div>
  );
}
