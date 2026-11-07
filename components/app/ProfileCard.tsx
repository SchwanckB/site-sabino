import Link from 'next/link';

import { BeltDisplay } from '@/components/app/BeltDisplay';
import { cn, initials } from '@/lib/utils';

/**
 * O cartão do perfil: banner, foto, nome, faixa e os números de frequência.
 *
 * Usado na comunidade, na própria tela do perfil e na prévia da edição —
 * assim o aluno vê exatamente o que os colegas vão ver antes de publicar,
 * que é a única forma honesta de pedir uma decisão de privacidade.
 *
 * As imagens vêm de `/api/perfil/{id}/{avatar|banner}`, uma rota que confere
 * a sessão e a visibilidade a cada requisição — não há URL pública para a
 * foto de ninguém. `<img>` cru em vez de `next/image`: a otimização do Next
 * proxia a imagem e a guarda em cache compartilhado, o que furaria justamente
 * essa checagem.
 */

export interface ProfileCardData {
  readonly studentId: string;
  readonly name: string;
  readonly belt: string;
  readonly degree: number;
  readonly isKids: boolean;
  readonly bio: string;
  readonly hasAvatar: boolean;
  readonly hasBanner: boolean;
  /** Tempo de casa já formatado: `2a 3m`. */
  readonly since: string | null;
  readonly totalCheckins: number;
  readonly monthCheckins: number;
  /** Semanas seguidas treinando. */
  readonly streakWeeks: number;
  /** Colocação no ranking geral, quando está no top. */
  readonly rankPosition: number | null;
}

export function ProfileCard({
  data,
  href,
  compact = false,
}: {
  readonly data: ProfileCardData;
  /** Transforma o cartão em link. Sem ele, é só apresentação. */
  readonly href?: string;
  /** Versão de lista: banner mais baixo e sem os números soltos. */
  readonly compact?: boolean;
}) {
  const corpo = (
    <article
      className={cn(
        'overflow-hidden rounded-2xl border border-hairline bg-white/[.03] transition-colors',
        href ? 'hover:border-white/25' : '',
      )}
    >
      {/* Banner ------------------------------------------------------------ */}
      <div className={cn('relative w-full bg-white/[.06]', compact ? 'h-20' : 'h-36 sm:h-44')}>
        {data.hasBanner ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/perfil/${data.studentId}/banner`}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-crimson/25 via-white/[.04] to-transparent" />
        )}
      </div>

      <div className={cn('px-4 pb-4', compact ? '-mt-7' : '-mt-10 sm:px-6 sm:pb-6')}>
        {/* Foto ---------------------------------------------------------- */}
        <div
          className={cn(
            'relative overflow-hidden rounded-full border-2 border-background bg-white/[.08]',
            compact ? 'h-14 w-14' : 'h-20 w-20',
          )}
        >
          {data.hasAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/perfil/${data.studentId}/avatar`}
              alt={data.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className={cn(
                'flex h-full w-full items-center justify-center font-display text-muted',
                compact ? 'text-sm' : 'text-xl',
              )}
            >
              {initials(data.name)}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h3
              className={cn(
                'truncate font-display uppercase tracking-tight text-foreground',
                compact ? 'text-base' : 'text-xl',
              )}
            >
              {data.name}
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              {data.since ? `Na academia há ${data.since}` : 'Começando agora'}
              {data.rankPosition !== null ? ` · ${data.rankPosition}º no ranking geral` : ''}
            </p>
          </div>

          <BeltDisplay
            belt={data.belt}
            degree={data.degree}
            isKids={data.isKids}
            className={compact ? 'max-w-[120px]' : 'max-w-[160px]'}
          />
        </div>

        {data.bio.length > 0 ? (
          <p
            className={cn(
              'mt-3 text-sm leading-relaxed text-muted',
              compact ? 'line-clamp-2' : '',
            )}
          >
            {data.bio}
          </p>
        ) : null}

        {!compact ? (
          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-hairline pt-4">
            <Numero rotulo="Treinos" valor={data.totalCheckins} />
            <Numero rotulo="Neste mês" valor={data.monthCheckins} />
            <Numero
              rotulo={data.streakWeeks === 1 ? 'Semana seguida' : 'Semanas seguidas'}
              valor={data.streakWeeks}
            />
          </dl>
        ) : (
          <p className="mt-3 text-xs text-muted">
            {data.totalCheckins} {data.totalCheckins === 1 ? 'treino' : 'treinos'}
            {data.streakWeeks > 0
              ? ` · ${data.streakWeeks} ${data.streakWeeks === 1 ? 'semana' : 'semanas'} seguida${data.streakWeeks === 1 ? '' : 's'}`
              : ''}
          </p>
        )}
      </div>
    </article>
  );

  if (!href) return corpo;

  return (
    <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson">
      {corpo}
    </Link>
  );
}

function Numero({ rotulo, valor }: { readonly rotulo: string; readonly valor: number }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{rotulo}</dt>
      <dd className="mt-0.5 font-display text-2xl leading-none tabular-nums text-crimson">
        {valor}
      </dd>
    </div>
  );
}
