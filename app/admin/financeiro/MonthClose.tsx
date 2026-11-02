import { Stat, StatStrip } from '@/components/app/PageHeader';
import { cn } from '@/lib/utils';
import { formatCents } from '@/utils/paymentEngine';
import type { FinanceMonthSummary } from '@/utils/financeMonth';

/**
 * Fechamento do mês.
 *
 * O financeiro respondia por aluno e não respondia pelo mês. Esta faixa é a
 * resposta de "a academia cresceu?": quanto entrou, quanto era previsto,
 * quanto está em aberto e como foi contra o mês passado.
 *
 * Componente de servidor: são só números já calculados.
 */
export function MonthClose({
  current,
  previous,
  variation,
  openCents,
  overdueCount,
  monthLabel,
  previousLabel,
}: {
  readonly current: FinanceMonthSummary;
  readonly previous: FinanceMonthSummary;
  /** Variação do recebido contra o mês anterior, em %. `null` sem base. */
  readonly variation: number | null;
  /** Total vencido e não pago, hoje. */
  readonly openCents: number;
  readonly overdueCount: number;
  /** `Março de 2026`. */
  readonly monthLabel: string;
  readonly previousLabel: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-lg uppercase tracking-tight">{monthLabel}</h2>
        <p className="text-xs text-muted">
          {current.paymentsCount}{' '}
          {current.paymentsCount === 1 ? 'pagamento lançado' : 'pagamentos lançados'}
        </p>
      </div>

      <StatStrip>
        <Stat
          label="Recebido no mês"
          value={formatCents(current.receivedCents)}
          tone="destaque"
          {...(variation !== null
            ? {
                hint: `${variation > 0 ? '+' : ''}${variation}% vs ${previousLabel.toLowerCase()}`,
              }
            : { hint: `${previousLabel}: ${formatCents(previous.receivedCents)}` })}
        />
        <Stat
          label="Previsto no mês"
          value={formatCents(current.expectedCents)}
          {...(current.collectedPercent !== null
            ? {
                progress: { value: current.receivedCents, max: current.expectedCents },
                hint: `${current.collectedPercent}% já entrou`,
              }
            : { hint: 'nenhum vencimento neste mês' })}
        />
        <Stat
          label="Em aberto agora"
          value={formatCents(openCents)}
          tone={openCents > 0 ? 'alerta' : 'bom'}
          hint={
            overdueCount > 0
              ? `${overdueCount} ${overdueCount === 1 ? 'aluno vencido' : 'alunos vencidos'}`
              : 'ninguém atrasado'
          }
        />
        <Stat
          label={previousLabel}
          value={formatCents(previous.receivedCents)}
          hint={`${previous.paymentsCount} ${previous.paymentsCount === 1 ? 'pagamento' : 'pagamentos'}`}
        />
      </StatStrip>

      {/*
        Formas de pagamento: é o que diz se a academia já migrou para o Pix ou
        ainda roda em dinheiro — e dinheiro no balcão é a parte que mais escapa
        do registro.
      */}
      {current.byMethod.length > 0 ? (
        <div className="panel panel-pad">
          <p className="panel-title">Como entrou</p>
          <ul className="mt-3 space-y-2">
            {current.byMethod.map((item) => {
              const pct =
                current.receivedCents > 0
                  ? Math.round((item.cents / current.receivedCents) * 100)
                  : 0;

              return (
                <li key={item.method}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-foreground">{item.method}</span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {formatCents(item.cents)}
                      <span className="ml-2 text-xs">{pct}%</span>
                    </span>
                  </div>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/[.07]">
                    <span
                      className={cn('block h-full rounded-full bg-crimson')}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
