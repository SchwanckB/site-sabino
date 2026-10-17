import { cn } from '@/lib/utils';

/**
 * Cabeçalho das telas do painel.
 *
 * Substitui o par "eyebrow vermelho + título gigante + parágrafo explicando o
 * que a tela faz" que se repetia em todas elas. Explicação sob cada título é
 * o que mais faz um sistema parecer demonstração: quem usa o painel todo dia
 * já sabe o que é "Financeiro", e aquele texto só empurra os dados para baixo
 * da dobra.
 *
 * O que sobra é o essencial — onde estou, e o que posso fazer daqui.
 */
export function PageHeader({
  title,
  meta,
  actions,
  className,
}: {
  readonly title: string;
  /** Uma linha curta de contexto. Opcional, e quase sempre dispensável. */
  readonly meta?: React.ReactNode;
  readonly actions?: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-hairline pb-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl leading-none sm:text-[1.75rem]">{title}</h1>
        {meta ? <p className="mt-1.5 text-sm leading-snug text-muted">{meta}</p> : null}
      </div>

      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/**
 * Faixa de indicadores.
 *
 * Numa linha só, divididos por régua vertical em vez de cada um no seu
 * cartão. Quatro caixas idênticas lado a lado não têm hierarquia nenhuma —
 * aqui o olho lê a sequência como um painel único.
 */
export function StatStrip({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="panel grid grid-cols-2 divide-x divide-y divide-white/[.07] sm:grid-cols-4 sm:divide-y-0">
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'neutro',
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly tone?: 'neutro' | 'alerta' | 'bom';
}) {
  return (
    <div className="min-w-0 px-4 py-3.5">
      <p className="stat-label truncate">{label}</p>
      <p
        className={cn(
          'stat-value mt-1.5',
          tone === 'alerta' ? 'text-crimson' : tone === 'bom' ? 'text-emerald-300' : '',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 truncate text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}
