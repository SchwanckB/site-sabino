import Image from 'next/image';

import { Reveal, SectionHeading, Stagger, StaggerItem } from '@/components/ui/Reveal';
import { EXAMPLE_DATA_NOTICE, testimonials } from '@/data/seed';
import { initials } from '@/lib/utils';

export function Testimonials() {
  const hasExampleData = testimonials.some((item) => item.isExample);

  return (
    <section
      id="depoimentos"
      aria-labelledby="depoimentos-titulo"
      className="relative border-t border-hairline bg-surface/40 py-20 sm:py-24 lg:py-32"
    >
      <div className="container-page">
        <SectionHeading
          id="depoimentos-titulo"
          eyebrow="Quem treina aqui"
          title="O que os alunos dizem"
        />

        {hasExampleData ? (
          <Reveal className="mt-6 max-w-xl">
            <p
              role="note"
              className="rounded-xl border border-dashed border-crimson/40 bg-crimson/[.06] px-4 py-3 text-xs leading-relaxed text-muted"
            >
              {EXAMPLE_DATA_NOTICE} Publique apenas depoimentos reais, com autorizacao de uso
              de nome e imagem.
            </p>
          </Reveal>
        ) : null}

        <Stagger as="ul" className="mt-12 grid gap-5 lg:grid-cols-3">
          {testimonials.map((testimonial, index) => (
            <StaggerItem
              key={testimonial.id}
              as="li"
              /* Escalonamento vertical leve: evita a grade perfeitamente alinhada. */
              className={index === 1 ? 'lg:mt-8' : undefined}
            >
              <figure className="surface-card flex h-full flex-col p-6 sm:p-7">
                <span
                  aria-hidden="true"
                  className="font-display text-5xl leading-none text-crimson/40"
                >
                  &ldquo;
                </span>

                <blockquote className="mt-2 flex-1">
                  <p className="text-sm leading-relaxed text-foreground/90 sm:text-base">
                    {testimonial.quote}
                  </p>
                </blockquote>

                <figcaption className="mt-6 flex items-center gap-3 border-t border-hairline pt-5">
                  {testimonial.avatarSlot ? (
                    <Image
                      src={testimonial.avatarSlot}
                      alt=""
                      width={44}
                      height={44}
                      className="h-11 w-11 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-hairline bg-white/[.06] font-display text-sm text-muted"
                    >
                      {initials(testimonial.name)}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {testimonial.name}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {testimonial.role}
                    </span>
                  </span>
                </figcaption>
              </figure>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
