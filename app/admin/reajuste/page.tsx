import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader, Stat, StatStrip } from '@/components/app/PageHeader';

import { requirePermission } from '@/lib/auth';
import { getPaymentPlans } from '@/lib/repositories/payments';
import { listStudentsByStatus } from '@/lib/repositories/students';
import { getUnitScope } from '@/lib/unitScope';
import { UNIT_SCOPE_LABELS, UNIT_SHORT, filterByUnit } from '@/types/domain';
import { formatBr } from '@/utils/datetime';
import { formatCents, installmentCents, PLAN_LABELS } from '@/utils/paymentEngine';
import { buildHaystack } from '@/utils/searchText';

import { BulkRaise, type RaiseRow } from './BulkRaise';

export const metadata: Metadata = { title: 'Reajuste em lote' };
export const dynamic = 'force-dynamic';

/**
 * Reajuste em lote.
 *
 * Reajustar aluno por aluno é o que fazia o reajuste ser postergado: trinta
 * alunos, trinta telas, e no fim do ano a tabela do site não tem relação com
 * o que a academia recebe. Aqui o percentual entra uma vez, a tela mostra o
 * antes e o depois de cada um e o total do mês, e a gravação é uma só.
 *
 * O desconto de quem tem bolsa é preservado (o percentual incide sobre o valor
 * de tabela) e o vencimento não se move — reajuste é valor, não prazo.
 */
export default async function ReajustePage() {
  await requirePermission('dinheiro');

  const scope = await getUnitScope();

  const ativos = filterByUnit(await listStudentsByStatus('ativo'), scope);
  const plans = await getPaymentPlans(ativos.map((student) => student.id));

  const rows: RaiseRow[] = ativos
    .flatMap((student): RaiseRow[] => {
      const plan = plans.get(student.id);
      // Quem não tem mensalidade definida não entra na lista: a action o
      // ignoraria, e um aluno marcável que o servidor pula é uma promessa que
      // a tela não cumpre. O aviso de quantos ficaram de fora vem abaixo.
      if (!plan) return [];

      return [
        {
          id: student.id,
          name: student.name,
          category: student.category,
          planId: plan.planId,
          planLabel: PLAN_LABELS[plan.planId],
          planName: plan.planName,
          unitShort: UNIT_SHORT[student.unit],
          amountCents: plan.amountCents,
          discountCents: plan.discountCents,
          netCents: installmentCents(plan),
          dueDateLabel: formatBr(plan.dueDate),
          haystack: buildHaystack([student.name, plan.planName]),
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const semPlano = ativos.length - rows.length;

  // O que a academia fatura hoje, somando só o mensal: trimestral e anual têm
  // período diferente, e misturá-los daria um "total do mês" que não existe.
  const mensais = rows.filter((row) => row.planId === 'mensal');
  const totalMensal = mensais.reduce((soma, row) => soma + row.netCents, 0);
  const ticket = mensais.length === 0 ? 0 : Math.round(totalMensal / mensais.length);
  const comDesconto = rows.filter((row) => row.discountCents > 0).length;

  return (
    <div className="page-stack">
      <PageHeader
        title="Reajuste em lote"
        meta={UNIT_SCOPE_LABELS[scope]}
        actions={
          <Link href="/admin/financeiro" className="btn-secondary text-sm">
            Mensalidade de um aluno
          </Link>
        }
      />

      <StatStrip>
        <Stat
          label="Com mensalidade"
          value={String(rows.length)}
          hint={semPlano > 0 ? `${semPlano} ativos sem valor definido` : 'todos os ativos'}
        />
        <Stat
          label="Planos mensais"
          value={String(mensais.length)}
          hint={`${rows.length - mensais.length} em trimestral ou anual`}
        />
        <Stat
          label="Receita mensal"
          value={formatCents(totalMensal)}
          hint="só os planos mensais, já com desconto"
          tone="destaque"
        />
        <Stat
          label="Ticket médio"
          value={formatCents(ticket)}
          hint={comDesconto > 0 ? `${comDesconto} com desconto` : 'ninguém com desconto'}
        />
      </StatStrip>

      {rows.length === 0 ? (
        <div className="panel px-6 py-16 text-center">
          <p className="font-display text-lg uppercase tracking-tight">
            Nenhuma mensalidade definida
          </p>
          <p className="mt-2 max-w-prose text-sm text-muted">
            O reajuste parte do valor de cada aluno. Defina a mensalidade em{' '}
            <Link href="/admin/financeiro" className="text-crimson hover:underline">
              Financeiro
            </Link>{' '}
            e volte aqui.
          </p>
        </div>
      ) : (
        <BulkRaise rows={rows} />
      )}
    </div>
  );
}
