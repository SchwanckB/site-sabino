import { cn } from '@/lib/utils';
import { beltLabel } from '@/types/domain';
import { getDegreeColor } from '@/utils/graduationEngine';

/**
 * Faixa desenhada em SVG, com a ponteira preta e as tarjas de grau.
 *
 * Nas turmas infantis a cor da tarja muda conforme o grau (1-4 branca, 5-8
 * vermelha, 9-12 amarela); nas adultas as tarjas são sempre brancas sobre a
 * ponteira. É a mesma leitura que o aluno faz olhando a própria faixa.
 */

const BELT_FILL: Readonly<Record<string, string>> = {
  branca: '#E8E8E8',
  cinza: '#9CA3AF',
  amarela: '#F2C200',
  laranja: '#F97316',
  verde: '#16A34A',
  azul: '#1D4ED8',
  roxa: '#6D28D9',
  marrom: '#78350F',
  // Um pouco acima do preto puro: no fundo escuro do painel, #1A1A1D
  // desaparecia e a faixa virava um buraco na tela.
  preta: '#26262B',
};

const STRIPE_FILL: Readonly<Record<string, string>> = {
  branca: '#F5F5F5',
  vermelha: '#C1121F',
  amarela: '#F2C200',
};

export function BeltDisplay({
  belt,
  degree,
  isKids,
  className,
}: {
  readonly belt: string;
  readonly degree: number;
  readonly isKids: boolean;
  readonly className?: string;
}) {
  const id = belt.toLowerCase();

  /**
   * A variação da faixa infantil é uma listra que corre ao longo do corpo:
   * `cinza-branca` é cinza com uma faixa branca no meio. A cor de base vem da
   * raiz do id, e as fichas antigas (`cinza`) caem na variação lisa.
   */
  const [raiz = 'branca', variacao] = id.split('-');
  const fill = BELT_FILL[raiz] ?? BELT_FILL[id] ?? '#E8E8E8';
  const listra = variacao === 'branca' ? '#F2F2F2' : variacao === 'preta' ? '#101014' : null;
  const maxDegrees = isKids ? 12 : 4;
  const shown = Math.min(Math.max(degree, 0), maxDegrees);

  // Em 12 graus as tarjas ficariam finas demais: duas fileiras resolvem.
  const perRow = isKids ? 6 : 4;
  const rows = Math.ceil(shown / perRow) || 1;

  const stripeColor = (index: number): string => {
    if (!isKids) return STRIPE_FILL['branca'] ?? '#F5F5F5';
    const color = getDegreeColor(index + 1);
    return color ? (STRIPE_FILL[color] ?? '#F5F5F5') : '#F5F5F5';
  };

  return (
    <svg
      viewBox="0 0 240 56"
      role="img"
      aria-label={`Faixa ${beltLabel(belt)}${shown > 0 ? ` com ${shown} ${shown === 1 ? 'grau' : 'graus'}` : ''}`}
      className={cn('h-auto w-full max-w-[240px]', className)}
    >
      {/* Corpo da faixa */}
      <rect x="0" y="14" width="240" height="28" rx="4" fill={fill} />
      <rect
        x="0"
        y="14"
        width="240"
        height="28"
        rx="4"
        fill="none"
        stroke="rgba(255,255,255,.28)"
        strokeWidth="1"
      />
      {/* Listra da variação (faixas infantis). */}
      {listra ? (
        <>
          <rect x="0" y="23" width="240" height="10" fill={listra} />
          <rect x="0" y="23" width="240" height="10" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="0.75" />
        </>
      ) : null}

      {/* Sombra interna, para a faixa não parecer um retângulo chapado */}
      <rect x="0" y="34" width="240" height="8" rx="2" fill="rgba(0,0,0,.12)" />

      {/* Ponteira preta, onde ficam as tarjas */}
      <rect x="166" y="10" width="62" height="36" rx="3" fill="#121214" />
      <rect
        x="166"
        y="10"
        width="62"
        height="36"
        rx="3"
        fill="none"
        stroke="rgba(255,255,255,.3)"
        strokeWidth="1"
      />

      {Array.from({ length: shown }, (_, index) => {
        const row = Math.floor(index / perRow);
        const column = index % perRow;
        const width = isKids ? 6 : 7;
        const gap = isKids ? 3 : 5;
        const height = rows > 1 ? 13 : 28;
        const y = rows > 1 ? 14 + row * 15 : 14;

        return (
          <rect
            key={index}
            x={172 + column * (width + gap)}
            y={y}
            width={width}
            height={height}
            rx="1"
            fill={stripeColor(index)}
            stroke="rgba(0,0,0,.25)"
            strokeWidth="0.5"
          />
        );
      })}
    </svg>
  );
}
