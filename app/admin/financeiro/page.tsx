import type { Metadata } from 'next';

import { PageHeader } from '@/components/app/PageHeader';

import { requirePermission } from '@/lib/auth';
import { cobrancaFeitaNoMes, listFollowups } from '@/lib/repositories/followups';
import { getPaymentPlans, listPaymentHistory } from '@/lib/repositories/payments';
import { getAcademySettings } from '@/lib/repositories/settings';
import { listStudentsByStatus } from '@/lib/repositories/students';
import { getUnitScope } from '@/lib/unitScope';
import {
  PAYMENT_METHOD_LABELS,
  UNIT_LABELS,
  filterByUnit,
  type PaymentMethod,
  type StudentRecord,
} from '@/types/domain';
import { siteConfig } from '@/lib/site';
import { buildBillingMessage, whatsappLinkTo } from '@/utils/billingMessage';
import { daysBetween, saoPauloDateString } from '@/utils/datetime';
import {
  monthOverMonth,
  previousMonth,
  summarizeFinanceMonth,
  type ChargeItem,
  type PaidItem,
} from '@/utils/financeMonth';
import {
  delinquencyOverview,
  recoveryReport,
  studentDelinquency,
  type PaidInstallment,
  type RecoveryInput,
} from '@/utils/delinquency';
import { getPaymentSummary } from '@/utils/paymentEngine';

import { BillingQueue, type BillingTarget } from './BillingQueue';
import { DelinquencyPanel, type ChronicRow } from './DelinquencyPanel';
import { FinanceList, type FinanceRow } from './FinanceList';
import { MonthClose } from './MonthClose';

export const metadata: Metadata = { title: 'Financeiro' };
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

/** `2026-03` → `Março de 2026`. */
function monthLabel(month: string): string {
  const [ano, mes] = month.split('-');
  const nome = MESES[Number(mes) - 1] ?? month;
  return `${nome} de ${ano}`;
}

export default async function FinanceiroPage() {
  await requirePermission('dinheiro');

  const now = new Date();
  const hoje = saoPauloDateString(now);
  const mesAtual = hoje.slice(0, 7);
  const mesAnterior = previousMonth(mesAtual);

  const scope = await getUnitScope();

  /*
   * O caixa do mês inclui quem saiu.
   *
   * A lista de cobrança é dos ativos, mas o dinheiro que entrou no mês entrou
   * — inclusive de quem desistiu em seguida. Somar só os ativos faria a
   * receita do mês encolher sozinha quando alguém fosse desativado, e a
   * comparação com o mês anterior passaria a mentir.
   */
  const [ativos, inativos, settings, cobrados] = await Promise.all([
    listStudentsByStatus('ativo'),
    listStudentsByStatus('inativo'),
    getAcademySettings(),
    listFollowups('cobranca'),
  ]);

  const students = filterByUnit(ativos, scope);
  const paraCaixa = filterByUnit([...ativos, ...inativos], scope);

  const plans = await getPaymentPlans(students.map((student) => student.id));

  /*
   * Uma leitura de histórico por aluno, aproveitada para tudo: a forma do
   * último pagamento (que o recibo descreve) e o caixa dos dois meses. Antes
   * eram as mesmas N idas ao Redis para pegar só o último lançamento.
   */
  const historicos = new Map(
    await Promise.all(
      paraCaixa.map(async (student): Promise<[string, Awaited<ReturnType<typeof listPaymentHistory>>]> => [
        student.id,
        await listPaymentHistory(student.id, 36),
      ]),
    ),
  );

  const metodo = (value: string): string =>
    PAYMENT_METHOD_LABELS[value as PaymentMethod] ?? value;

  const pagamentos: PaidItem[] = [];
  for (const entries of historicos.values()) {
    for (const entry of entries) {
      pagamentos.push({
        // Caixa: o que vale é o dia em que o dinheiro entrou, no fuso da
        // academia — `paidAt` é ISO em UTC e viraria o mês na virada do dia.
        date: saoPauloDateString(new Date(entry.paidAt)),
        amountCents: entry.amountCents,
        method: metodo(entry.method),
      });
    }
  }

  const telefoneDe = (student: StudentRecord): string =>
    student.guardianPhone ?? student.phone;

  const rows: FinanceRow[] = students
    .map((student) => {
      const plan = plans.get(student.id);
      const ultimo = historicos.get(student.id)?.[0];
      const lastMethod = ultimo ? metodo(ultimo.method) : '';

      if (!plan) {
        return {
          id: student.id,
          name: student.name,
          planId: 'mensal' as const,
          planName: '',
          amountCents: 0,
          dueDate: '',
          limitDate: '',
          dueDay: 10,
          graceDays: 4,
          status: 'em_dia' as const,
          openInstallments: 0,
          totalOpenCents: 0,
          lastPaidAt: null,
          hasPlan: false,
          grossCents: 0,
          discountCents: 0,
          discountReason: '',
          creditCents: 0,
          phone: telefoneDe(student),
          unitLabel: UNIT_LABELS[student.unit],
          lastMethod,
        };
      }

      const summary = getPaymentSummary(plan, now);

      return {
        id: student.id,
        name: student.name,
        planId: summary.planId,
        planName: summary.planName,
        amountCents: summary.amountCents,
        dueDate: summary.dueDate,
        limitDate: summary.limitDate,
        dueDay: plan.dueDay,
        graceDays: plan.graceDays,
        status: summary.status,
        openInstallments: summary.openInstallments,
        totalOpenCents: summary.totalOpenCents,
        lastPaidAt: summary.lastPaidAt,
        hasPlan: true,
        grossCents: summary.grossCents,
        discountCents: summary.discountCents,
        discountReason: summary.discountReason,
        creditCents: summary.creditCents,
        phone: telefoneDe(student),
        unitLabel: UNIT_LABELS[student.unit],
        lastMethod,
      };
    })
    // Vencidas primeiro, depois por data de vencimento.
    .sort((a, b) => {
      const weight = (row: FinanceRow): number =>
        !row.hasPlan ? 3 : row.status === 'vencida' ? 0 : row.status === 'vence_em_breve' ? 1 : 2;
      const diff = weight(a) - weight(b);
      return diff !== 0 ? diff : a.dueDate.localeCompare(b.dueDate);
    });

  // Previsto do mês: o que cada plano cobra na data que vence.
  const cobrancasPrevistas: ChargeItem[] = rows
    .filter((row) => row.hasPlan && row.dueDate.length > 0)
    .map((row) => ({ dueDate: row.dueDate, amountCents: row.amountCents }));

  const resumoAtual = summarizeFinanceMonth(pagamentos, cobrancasPrevistas, mesAtual);
  const resumoAnterior = summarizeFinanceMonth(pagamentos, cobrancasPrevistas, mesAnterior);

  const vencidas = rows.filter((row) => row.status === 'vencida');
  const openCents = vencidas.reduce((soma, row) => soma + row.totalOpenCents, 0);

  // A fila de cobrança carrega o texto pronto, montado aqui no servidor.
  const targets: BillingTarget[] = vencidas.map((row) => {
    const message = buildBillingMessage({
      name: row.name,
      amountCents: row.amountCents,
      dueDate: row.dueDate,
      limitDate: row.limitDate,
      openInstallments: row.openInstallments,
      totalOpenCents: row.totalOpenCents,
      overdue: true,
      pixKey: settings.pixKey,
      academyName: siteConfig.name,
    });

    return {
      id: row.id,
      name: row.name,
      amountCents: row.amountCents,
      totalOpenCents: row.totalOpenCents,
      openInstallments: row.openInstallments,
      dueDate: row.dueDate,
      daysLate: row.dueDate.length > 0 ? Math.max(0, daysBetween(hoje, row.limitDate)) : 0,
      unitLabel: row.unitLabel,
      whatsappUrl: row.phone.length > 0 ? whatsappLinkTo(row.phone, message) : null,
      charged: cobrancaFeitaNoMes(cobrados.get(row.id), hoje),
    };
  });

  /*
   * Pontualidade: sai do histórico, não do estado de hoje.
   *
   * Cada baixa guarda o vencimento da parcela que quitou, então o atraso é um
   * dado. Pagamentos gravados antes desse campo ficam de fora — entrar com
   * atraso zero faria a academia parecer mais pontual do que é.
   */
  const perfis = students.map((student) =>
    studentDelinquency(
      student.id,
      (historicos.get(student.id) ?? []).map(
        (entry): PaidInstallment => ({
          paidOn: saoPauloDateString(new Date(entry.paidAt)),
          dueDate: entry.dueDate,
        }),
      ),
    ),
  );

  const overview = delinquencyOverview(perfis);
  const porId = new Map(students.map((student) => [student.id, student.name]));

  const chronic: ChronicRow[] = perfis
    .filter((perfil) => perfil.chronic)
    .sort((a, b) => (b.averageDelayDays ?? 0) - (a.averageDelayDays ?? 0))
    .slice(0, 10)
    .map((perfil) => ({
      id: perfil.userId,
      name: porId.get(perfil.userId) ?? perfil.userId,
      averageDelayDays: perfil.averageDelayDays,
      worstDelayDays: perfil.worstDelayDays,
      lateCount: perfil.lateCount,
      measured: perfil.measured,
    }));

  // A cobrança funciona? Cruza a data da cobrança com a do último pagamento.
  const recovery = recoveryReport(
    students.map((student): RecoveryInput => {
      const ultimo = historicos.get(student.id)?.[0];
      return {
        userId: student.id,
        chargedOn: cobrados.get(student.id),
        lastPaidOn: ultimo ? saoPauloDateString(new Date(ultimo.paidAt)) : undefined,
      };
    }),
  );

  return (
    <div className="page-stack">
      <PageHeader
        title="Financeiro"
        meta="Marque como pago quando o comprovante chegar; o vencimento avança sozinho."
      />

      {students.length === 0 ? (
        <div className="panel px-6 py-16 text-center">
          <p className="font-display text-lg uppercase tracking-tight">Nenhum aluno ativo</p>
          <p className="mt-2 text-sm text-muted">
            Aprove cadastros para começar o controle financeiro.
          </p>
        </div>
      ) : (
        <>
          <MonthClose
            current={resumoAtual}
            previous={resumoAnterior}
            variation={monthOverMonth(resumoAtual.receivedCents, resumoAnterior.receivedCents)}
            openCents={openCents}
            overdueCount={vencidas.length}
            monthLabel={monthLabel(mesAtual)}
            previousLabel={monthLabel(mesAnterior)}
          />

          <BillingQueue targets={targets} />

          <DelinquencyPanel overview={overview} recovery={recovery} chronic={chronic} />

          <FinanceList
            rows={rows}
            pixKey={settings.pixKey}
            pixOwner={settings.pixOwner}
            academyName={siteConfig.name}
          />
        </>
      )}
    </div>
  );
}
