import Image from 'next/image';

import { Reveal, SectionHeading, Stagger, StaggerItem } from '@/components/ui/Reveal';
import { modalities } from '@/data/seed';
import { whatsappLink, whatsappMessages } from '@/lib/site';
import { cn } from '@/lib/utils';

export function Modalities() {
  return (
    <section
      id="modalidades"
      aria-labelledby="modalidades-titulo"
      className="relative border-t border-hairline bg-surface/40 py-20 sm:py-24 lg:py-32"
    >
      <div className="container-page">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            id="modalidades-titulo"
            eyebrow="O que você treina"
            title={
              <>
                Três caminhos,
                <br />
                um tatame
              </>
            }
            description="Você pode começar por qualquer um deles. Muita gente acaba treinando dois."
          />
          <Reveal delay={0.12} className="shrink-0">
            <a
              href={whatsappLink(whatsappMessages.trial)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
            >
              Não sei por onde começar
            </a>
          </Reveal>
        </div>

        {/* O primeiro card ocupa duas colunas no desktop: quebra a grade simetrica. */}
        <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {modalities.map((modality, index) => (
            <StaggerItem
              key={modality.id}
              as="article"
              className={cn(
                'group relative flex flex-col overflow-hidden rounded-3xl border border-hairline bg-surface',
                index === 0 && 'sm:col-span-2 lg:col-span-2',
              )}
            >
              <div
                className={cn(
                  'relative w-full overflow-hidden',
                  index === 0 ? 'aspect-[16/10] lg:aspect-[16/9]' : 'aspect-[4/3]',
                )}
              >
                <Image
                  src={modality.imageSlot}
                  alt={modality.imageAlt}
                  fill
                  sizes={
                    index === 0
                      ? '(min-width: 1024px) 66vw, (min-width: 640px) 100vw, 100vw'
                      : '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw'
                  }
                  className="object-cover transition-transform duration-700 ease-organic group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent" />
              </div>

              <div className="flex flex-1 flex-col p-6 sm:p-7">
                <h3 className="text-2xl leading-none sm:text-3xl">{modality.name}</h3>
                <p className="mt-2 text-sm font-medium text-crimson">{modality.tagline}</p>
                <p className="mt-4 flex-1 text-sm leading-relaxed text-muted sm:text-base">
                  {modality.description}
                </p>

                <ul className="mt-6 flex flex-wrap gap-2">
                  {modality.highlights.map((highlight) => (
                    <li
                      key={highlight}
                      className="rounded-full border border-hairline bg-white/[.04] px-3 py-1.5 text-xs text-muted"
                    >
                      {highlight}
                    </li>
                  ))}
                </ul>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
