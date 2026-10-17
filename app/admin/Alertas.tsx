import Link from 'next/link';

import { cn } from '@/lib/utils';
import type { AgeTransition, Birthday } from '@/utils/roster';

/**
 * Dois avisos que o sistema sabe e o professor não tem como lembrar sozinho:
 * quem faz aniversário no mês e quem está saindo da trilha infantil.
 *
 * Componente de servidor — é só leitura, não precisa de JavaScript no cliente.
 */
export function Alertas({
  birthdays,
  transitions,
}: {
  readonly birthdays: readonly Birthday[];
  readonly transitions: readonly AgeTransition[];
}) {
  if (birthdays.length === 0 && transitions.length === 0) return null;

  return (
    /*
      `min-w-0` nos cartões: `truncate` aplica `white-space: nowrap`, então um
      nome comprido vira o min-content do cartão e, num grid de coluna `auto`,
      estica a faixa inteira para além da tela. Com min-width zerado a faixa
      volta a seguir o container e o nome é que corta.
    */
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {birthdays.length > 0 ? (
        <section className="surface-card min-w-0 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base normal-case tracking-normal">Aniversariantes do mês</h2>
            <span className="shrink-0 text-xs tabular-nums text-muted">{birthdays.length}</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Uma mensagem no dia custa nada e segura aluno.
          </p>

          <ul className="mt-4 divide-y divide-hairline">
            {birthdays.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/admin/alunos/${item.id}`}
                  className={cn(
                    'group flex min-h-[44px] items-center gap-3 py-2 text-sm',
                    item.isPast && 'opacity-55',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums',
                      item.isToday
                        ? 'bg-crimson text-foreground'
                        : 'border border-hairline bg-white/[.04] text-muted',
                    )}
                  >
                    {item.day}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-foreground group-hover:text-crimson">
                    {item.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {item.isToday ? 'hoje · ' : ''}
                    {item.turning} anos
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {transitions.length > 0 ? (
        <section
          className={cn(
            'min-w-0 rounded-2xl border p-5 backdrop-blur-md',
            transitions.some((t) => t.overdue)
              ? 'border-crimson/40 bg-crimson/[.07]'
              : 'border-amber-500/30 bg-amber-500/[.05]',
          )}
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base normal-case tracking-normal">Saindo da trilha infantil</h2>
            <span className="shrink-0 text-xs tabular-nums text-muted">{transitions.length}</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Aos 16 anos o grau deixa de sair a cada 30 dias e o aluno passa para a faixa adulta.
            Sem aviso, isso só aparece quando alguém estranha que ele parou de graduar.
          </p>

          <ul className="mt-4 divide-y divide-white/10">
            {transitions.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/admin/alunos/${item.id}`}
                  className="group flex min-h-[44px] items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-foreground group-hover:text-crimson">
                    {item.name}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 text-xs',
                      item.overdue ? 'font-semibold text-crimson' : 'text-muted',
                    )}
                  >
                    {item.overdue
                      ? 'já fez 16 — migrar'
                      : item.daysUntil === 0
                        ? 'faz 16 hoje'
                        : `em ${item.daysUntil} ${item.daysUntil === 1 ? 'dia' : 'dias'}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
