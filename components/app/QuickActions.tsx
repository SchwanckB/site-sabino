import Link from 'next/link';

import { Icon, type IconName } from '@/components/app/Icon';
import { cn } from '@/lib/utils';

export interface QuickAction {
  readonly href: string;
  readonly label: string;
  /** Uma linha dizendo o que acontece ao clicar. */
  readonly hint: string;
  readonly icon: IconName;
  /** Contador na quina — cadastros na fila, mensalidades vencidas. */
  readonly badge?: number;
  /**
   * `true` quando há algo esperando ação. A quina acende e a borda ganha a cor
   * da marca: numa grade de seis atalhos iguais, o que tem fila precisa
   * aparecer antes dos outros.
   */
  readonly urgent?: boolean;
}

/**
 * Atalhos das funções de gestão, na primeira dobra da visão geral.
 *
 * O painel tinha os números de relance e a navegação na coluna, mas o caminho
 * entre ver um problema e agir sobre ele passava por achar a página no menu.
 * "Dezoito mensalidades vencidas" é informação; "Cobrar agora" é o trabalho.
 *
 * A grade mostra o que a pessoa pode de fato abrir — quem monta a lista já
 * filtrou por permissão. Botão que leva a um "isso é da gestão" é pior que
 * botão ausente.
 */
export function QuickActions({ actions }: { readonly actions: readonly QuickAction[] }) {
  if (actions.length === 0) return null;

  return (
    <nav aria-label="Atalhos de gestão">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {actions.map((action) => (
          <li key={action.href}>
            <Link
              href={action.href}
              className={cn(
                'group relative flex h-full min-h-[88px] flex-col justify-between gap-2 rounded-xl border p-3.5',
                'ease-organic hover:-translate-y-0.5',
                'motion-reduce:transform-none motion-reduce:transition-none',
                action.urgent
                  ? 'border-crimson/45 bg-crimson/[.07] hover:border-crimson/70'
                  : 'border-white/[.07] bg-surface/60 hover:border-white/20 hover:bg-white/[.05]',
              )}
              style={{
                transitionProperty: 'transform, border-color, background-color',
                transitionDuration: 'var(--t-base)',
              }}
            >
              <span className="flex items-start justify-between gap-2">
                <Icon
                  name={action.icon}
                  className={cn('h-5 w-5 shrink-0', action.urgent ? 'text-accent' : 'text-muted')}
                />
                {action.badge !== undefined && action.badge > 0 ? (
                  <span className="min-w-[20px] shrink-0 rounded-full bg-crimson px-1.5 text-center text-[11px] font-semibold leading-5 tabular-nums text-foreground">
                    {action.badge}
                  </span>
                ) : null}
              </span>

              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {action.label}
                </span>
                {/*
                  A dica some no celular: em 320px a grade tem ~150px por
                  coluna, e duas linhas de 11px ali viram ruído sob um rótulo
                  que já diz o essencial.
                */}
                <span className="mt-0.5 hidden truncate text-[11px] leading-snug text-muted sm:block">
                  {action.hint}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
