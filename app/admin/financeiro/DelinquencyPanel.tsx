import Link from 'next/link';

import { Stat, StatStrip } from '@/components/app/PageHeader';
import type { DelinquencyOverview, RecoveryReport } from '@/utils/delinquency';

/** Um aluno que atrasa por hábito, já resolvido para a tela. */
export interface ChronicRow {
  readonly id: string;
  readonly name: string;
  readonly averageDelayDays: number | null;
  readonly worstDelayDays: number;
  readonly lateCount: number;
  readonly measured: number;
}

/**
 * Inadimplência com história.
 *
 * O financeiro dizia quem está vencido **hoje**. Não dizia se o aluno atrasa
 * sempre ou atrasou uma vez, nem se a cobrança que o professor manda serve
 * para alguma coisa. São perguntas diferentes, e nenhuma se responde olhando a
 * lista do dia.
 */
export function DelinquencyPanel({
  overview,
  recovery,
  chronic,
}: {
  readonly overview: DelinquencyOverview;
  readonly recovery: RecoveryReport;
  readonly chronic: readonly ChronicRow[];
}) {
  if (overview.measuredPayments === 0) {
    return (
      <section className="panel panel-pad">
        <p className="panel-title">Pontualidade</p>
        <p className="mt-2 text-sm text-muted">
          Ainda não há pagamento suficiente para medir atraso. A conta começa a existir a partir
          dos registros feitos de agora em diante, que guardam o vencimento de cada parcela.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg uppercase tracking-tight">Pontualidade</h2>
        <span className="text-xs text-muted">
          {overview.measuredPayments}{' '}
          {overview.measuredPayments === 1 ? 'pagamento medido' : 'pagamentos medidos'}
        </span>
      </div>

      <StatStrip>
        <Stat
          label="Pagam em dia"
          value={overview.onTimePercent !== null ? `${overview.onTimePercent}%` : '--'}
          tone={
            overview.onTimePercent !== null && overview.onTimePercent >= 80 ? 'bom' : 'neutro'
          }
          hint="dos pagamentos registrados"
        />
        <Stat
          label="Atraso médio"
          value={
            overview.averageDelayDays !== null
              ? `${overview.averageDelayDays} ${overview.averageDelayDays === 1 ? 'dia' : 'dias'}`
              : 'nenhum'
          }
          tone={
            overview.averageDelayDays !== null && overview.averageDelayDays > 7
              ? 'alerta'
              : 'neutro'
          }
          hint="só entre os atrasados"
        />
        <Stat
          label="Atrasam sempre"
          value={String(chronic.length)}
          tone={chronic.length > 0 ? 'alerta' : 'bom'}
          hint="maioria dos pagamentos em atraso"
        />
        <Stat
          label="Cobrança funciona"
          value={recovery.recoveryPercent !== null ? `${recovery.recoveryPercent}%` : '--'}
          {...(recovery.charged > 0
            ? { hint: `${recovery.recovered} de ${recovery.charged} pagaram em 7 dias` }
            : { hint: 'ninguém cobrado neste mês' })}
        />
      </StatStrip>

      {chronic.length > 0 ? (
        <div className="panel panel-pad">
          <p className="panel-title">Quem atrasa por hábito</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Três pagamentos ou mais, a maioria em atraso. Não é quem esqueceu uma vez — é com
            quem vale combinar outro dia de vencimento.
          </p>

          <ul className="mt-3 divide-y divide-hairline">
            {chronic.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <Link
                  href={`/admin/alunos/${row.id}`}
                  className="min-w-0 truncate text-sm text-foreground hover:text-crimson"
                >
                  {row.name}
                </Link>
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {row.lateCount} de {row.measured} em atraso
                  {row.averageDelayDays !== null ? ` · média de ${row.averageDelayDays} dias` : ''}
                  {row.worstDelayDays > 0 ? ` · pior ${row.worstDelayDays}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
