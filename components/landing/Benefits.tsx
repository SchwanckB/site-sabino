import { SectionHeading, Stagger, StaggerItem } from '@/components/ui/Reveal';
import { benefits } from '@/data/seed';

export function Benefits() {
  return (
    <section
      id="beneficios"
      aria-labelledby="beneficios-titulo"
      className="py-20 sm:py-24 lg:py-32"
    >
      <div className="container-page">
        <SectionHeading
          id="beneficios-titulo"
          eyebrow="Por que a Sabino"
          title="O que muda quando o treino tem acompanhamento"
        />

        {/* Lista numerada: hierarquia tipografica no lugar de icones decorativos. */}
        <Stagger as="ul" className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((benefit, index) => (
            <StaggerItem
              key={benefit.id}
              as="li"
              className="group relative border-t border-hairline pt-6 transition-colors duration-500 hover:border-crimson/60"
            >
              <span
                aria-hidden="true"
                className="font-display text-sm tabular-nums tracking-[0.2em] text-muted/60 transition-colors duration-500 group-hover:text-crimson"
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-3 text-xl leading-tight sm:text-2xl">{benefit.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
                {benefit.description}
              </p>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
