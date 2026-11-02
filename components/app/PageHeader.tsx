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

const TONE_CLASS = {
  neutro: '',
  destaque: 'text-crimson',
  alerta: 'text-crimson',
  bom: 'text-emerald-300',
} as const;

export function Stat({
  label,
  value,
  hint,
  tone = 'neutro',
  progress,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  /** `destaque` é acento, `alerta` é problema — a cor é a mesma, a intenção não. */
  readonly tone?: keyof typeof TONE_CLASS;
  /**
   * Barra fina sob o número, para indicador que tem teto conhecido ("8 de 12
   * aulas no mês"). Sem ela, `8` e `8/12` ocupam o mesmo espaço e dizem coisas
   * bem diferentes — e a fração sozinha obriga o aluno a fazer a conta.
   */
  readonly progress?: { readonly value: number; readonly max: number };
}) {
  const pct =
    progress && progress.max > 0
      ? Math.min(100, Math.round((progress.value / progress.max) * 100))
      : null;

  return (
    <div className="min-w-0 px-4 py-3.5">
      <p className="stat-label truncate">{label}</p>
      <p className={cn('stat-value mt-1.5', TONE_CLASS[tone])}>{value}</p>

      {pct !== null ? (
        <div
          className="mt-2 h-1 overflow-hidden rounded-full bg-white/[.07]"
          role="progressbar"
          aria-valuenow={progress?.value}
          aria-valuemin={0}
          aria-valuemax={progress?.max}
          aria-label={label}
        >
          <div className="h-full rounded-full bg-crimson transition-all" style={{ width: `${pct}%` }} />
        </div>
      ) : null}

      {hint ? <p className="mt-1 truncate text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}
