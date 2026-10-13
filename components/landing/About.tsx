import Image from 'next/image';

import { Reveal, SectionHeading } from '@/components/ui/Reveal';
import { siteConfig } from '@/lib/site';

export function About() {
  return (
    <section id="sobre" className="relative py-20 sm:py-24 lg:py-32">
      <div className="container-page">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-20">
          {/* Composicao assimetrica: imagem maior deslocada, apoio sobreposto. */}
          <Reveal direction="right" className="relative">
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl border border-hairline">
              <Image
                src="/images/academia-tatame.jpg"
                alt="Tatame da Sabino Academia preparado para o treino"
                fill
                sizes="(min-width: 1024px) 45vw, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/60 to-transparent" />
            </div>

            <div className="surface-card absolute -bottom-6 -right-2 w-44 p-4 sm:-right-6 sm:w-52 sm:p-5">
              <p className="font-display text-4xl leading-none text-crimson">16</p>
              <p className="mt-1 text-xs leading-snug text-muted sm:text-sm">
                anos e a idade em que o aluno sai da progressao Kids e entra na graduacao adulta
              </p>
            </div>
          </Reveal>

          <div>
            <SectionHeading
              eyebrow="A academia"
              title={
                <>
                  Treino serio,
                  <br />
                  recepcao de quem conhece seu nome
                </>
              }
              description={`A Sabino nasceu em ${siteConfig.city} com uma ideia simples: ninguem evolui sozinho. As turmas sao montadas por nivel, o professor corrige no tatame e cada graduacao tem criterio registrado.`}
            />

            <Reveal delay={0.1} className="mt-8 space-y-5 text-base leading-relaxed text-muted">
              <p>
                Aqui convivem o aluno que chegou para perder peso, o adolescente que veio pela
                defesa pessoal e o atleta que compete no fim de semana. O tatame e o mesmo; o
                que muda e a intensidade que cada um recebe.
              </p>
              <p>
                No verao, quando a cidade enche, a grade se adapta: treino cedo antes do
                trabalho e turmas no fim da tarde para quem vem da praia.
              </p>
            </Reveal>

            <Reveal delay={0.18} className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline sm:grid-cols-3">
              {[
                { label: 'Jiu-Jitsu', detail: 'Com kimono' },
                { label: 'MMA', detail: 'Trocacao e solo' },
                { label: 'Kids', detail: '12 graus' },
              ].map((item) => (
                <div key={item.label} className="bg-surface px-5 py-6">
                  <p className="font-display text-lg uppercase tracking-tight text-foreground">
                    {item.label}
                  </p>
                  <p className="mt-1 text-sm text-muted">{item.detail}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
