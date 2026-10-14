import Image from 'next/image';

import { Reveal, SectionHeading } from '@/components/ui/Reveal';
import { siteConfig } from '@/lib/site';

export function About() {
  return (
    <section id="sobre" className="relative py-20 sm:py-24 lg:py-32">
      <div className="container-page">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-20">
          {/* Composição assimétrica: imagem maior deslocada, apoio sobreposto. */}
          <Reveal direction="right" className="relative">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl border border-hairline">
              <Image
                src="/images/academia-tatame.jpg"
                alt="Fachada da Sabino Academia no centro de Três Cachoeiras"
                fill
                sizes="(min-width: 1024px) 45vw, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/60 to-transparent" />
            </div>

            <div className="surface-card absolute -bottom-6 -right-2 w-44 p-4 sm:-right-6 sm:w-52 sm:p-5">
              <p className="font-display text-4xl leading-none text-crimson">4</p>
              <p className="mt-1 text-xs leading-snug text-muted sm:text-sm">
                anos é a idade a partir da qual a criança já pode entrar no tatame
              </p>
            </div>
          </Reveal>

          <div>
            <SectionHeading
              eyebrow="A academia"
              title={
                <>
                  Treino sério,
                  <br />
                  recepção de quem conhece seu nome
                </>
              }
              description={`A Sabino fica no centro de ${siteConfig.city}, atrás da Escola Angelina Maggi. A ideia por trás dela é simples: ninguém evolui sozinho. As turmas são montadas por nível e idade, o professor corrige no tatame e cada graduação tem critério registrado.`}
            />

            <Reveal delay={0.1} className="mt-8 space-y-5 text-base leading-relaxed text-muted">
              <p>
                Aqui convivem o aluno que chegou para perder peso, a mãe que entrou pela
                turma feminina, o adolescente que veio pela defesa pessoal e o atleta que
                compete no fim de semana. O tatame é o mesmo; o que muda é a intensidade que
                cada um recebe.
              </p>
              <p>
                Com as crianças, a separação é levada a sério: a turma Kids, de 4 a 8 anos,
                trabalha coordenação e disciplina pela brincadeira dirigida; a Infantil, de 9
                a 16, já cobra técnica e responsabilidade. Nenhuma criança treina em uma
                turma que não é da idade dela.
              </p>
            </Reveal>

            <Reveal
              delay={0.18}
              className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline sm:grid-cols-3"
            >
              {[
                { label: 'Jiu-Jitsu', detail: 'Seg a sex, 20h30' },
                { label: 'MMA', detail: 'Seg, qua e sex' },
                { label: 'Kids', detail: 'A partir de 4 anos' },
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
