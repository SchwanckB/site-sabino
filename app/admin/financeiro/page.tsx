import type { Metadata } from 'next';

import { getPaymentPlans } from '@/lib/repositories/payments';
import { listStudentsByStatus } from '@/lib/repositories/students';
import { getPaymentSummary } from '@/utils/paymentEngine';

import { FinanceList, type FinanceRow } from './FinanceList';

export const metadata: Metadata = { title: 'Financeiro' };
export const dynamic = 'force-dynamic';

export default async function FinanceiroPage() {
  const now = new Date();
  const students = await listStudentsByStatus('ativo');
  const plans = await getPaymentPlans(students.map((student) => student.id));

  const rows: FinanceRow[] = students
    .map((student) => {
      const plan = plans.get(student.id);

      if (!plan) {
        return {
          id: student.id,
          name: student.name,
          planId: 'mensal' as const,
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
        };
      }

      const summary = getPaymentSummary(plan, now);

      return {
        id: student.id,
        name: student.name,
        planId: summary.planId,
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
      };
    })
    // Vencidas primeiro, depois por data de vencimento.
    .sort((a, b) => {
      const weight = (row: FinanceRow): number =>
        !row.hasPlan ? 3 : row.status === 'vencida' ? 0 : row.status === 'vence_em_breve' ? 1 : 2;
      const diff = weight(a) - weight(b);
      return diff !== 0 ? diff : a.dueDate.localeCompare(b.dueDate);
    });

  return (
    <div>
      <header>
        <p className="eyebrow">Mensalidades</p>
        <h1 className="mt-2 text-3xl leading-none sm:text-4xl">Financeiro</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Quando o aluno mandar o comprovante no WhatsApp, marque como pago aqui. O vencimento
          avança sozinho para o mês seguinte.
        </p>
      </header>

      {students.length === 0 ? (
        <div className="surface-card mt-8 px-6 py-16 text-center">
          <p className="font-display text-lg uppercase tracking-tight">Nenhum aluno ativo</p>
          <p className="mt-2 text-sm text-muted">
            Aprove cadastros para começar o controle financeiro.
          </p>
        </div>
      ) : (
        <div className="mt-8">
          <FinanceList rows={rows} />
        </div>
      )}
    </div>
  );
}
