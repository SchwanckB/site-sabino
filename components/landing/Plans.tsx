'use client';

import { motion, useReducedMotion } from 'framer-motion';

import { Reveal, SectionHeading } from '@/components/ui/Reveal';
import { EXAMPLE_DATA_NOTICE, type Plan } from '@/data/seed';
import { whatsappLink } from '@/lib/site';
import { cn } from '@/lib/utils';

export function Plans({ plans }: { readonly plans: readonly Plan[] }) {
  const reduceMotion = useReducedMotion();
  const hasExampleData = plans.some((plan) => plan.isExample);

  const regularPlans = plans.filter((plan) => plan.type !== 'pacote');
  const packages = plans.filter((plan) => plan.type === 'pacote');

  return (
    <section
      id="planos"
      aria-labelledby="planos-titulo"
      className="relative border-t border-hairline bg-surface/40 py-20 sm:py-24 lg:py-32"
    >
      <div className="container-page">
        <SectionHeading
          id="planos-titulo"
          eyebrow="Planos"
          title="Escolha o compromisso, não o desconto"
          description="Todos os planos dão acesso ao app do aluno, com check-in, histórico de treinos e status da mensalidade."
          align="center"
        />

        {hasExampleData ? (
          <Reveal className="mx-auto mt-6 max-w-xl">
            <p
              role="note"
              className="rounded-xl border border-dashed border-crimson/40 bg-crimson/[.06] px-4 py-3 text-center text-xs leading-relaxed text-muted"
            >
              {EXAMPLE_DATA_NOTICE}
            </p>
          </Reveal>
        ) : null}

        {regularPlans.length > 0 && (
          <div className="mt-14 grid items-start gap-5 lg:grid-cols-3">
            {regularPlans.map((plan, index) => (
            <motion.article
              key={plan.id}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{
                duration: reduceMotion ? 0.2 : 0.6,
                delay: reduceMotion ? 0 : index * 0.1,
                ease: [0.22, 1, 0.36, 1],
              }}
              whileHover={reduceMotion ? undefined : { y: -6 }}
              className={cn(
                'relative flex h-full flex-col rounded-3xl border p-7 backdrop-blur-md sm:p-8',
                plan.highlighted
                  ? 'border-crimson/50 bg-gradient-to-b from-crimson/[.10] to-white/[.03] shadow-glow lg:-mt-4 lg:pb-12 lg:pt-12'
                  : 'border-hairline bg-white/[.04]',
              )}
            >
              {plan.highlighted ? (
                <span className="absolute -top-3 left-7 rounded-full bg-crimson px-3 py-1 font-display text-[11px] uppercase tracking-[0.16em] text-foreground">
                  Mais escolhido
                </span>
              ) : null}

              <h3 className="text-2xl leading-none">{plan.name}</h3>

              {/* O preço fica sob o h1 da página: é dado, não manchete. */}
              <p className="mt-5 flex items-baseline gap-1.5">
                <span className="font-display text-4xl leading-none text-foreground sm:text-5xl">
                  {plan.priceLabel}
                </span>
                <span className="text-sm text-muted">{plan.periodLabel}</span>
              </p>

              <p className="mt-4 text-sm leading-relaxed text-muted">{plan.summary}</p>

              <ul className="mt-7 flex-1 space-y-3 border-t border-hairline pt-7">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-3 text-sm text-foreground/90">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        plan.highlighted ? 'text-accent' : 'text-muted',
                      )}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m4 10.5 4 4 8-9" />
                    </svg>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <a
                href={whatsappLink(
                  `Olá! Vim pelo site e quero saber mais sobre o plano ${plan.name}.`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className={cn('mt-8 w-full', plan.highlighted ? 'btn-primary' : 'btn-secondary')}
              >
                Falar sobre o plano {plan.name}
              </a>
            </motion.article>
          ))}
          </div>
        )}

        {packages.length > 0 && (
          <div className="mt-16 border-t border-hairline pt-16">
            <h2 className="mb-12 text-center text-2xl font-display leading-none">
              Pacotes Promocionais
            </h2>
            <div className="grid items-start gap-5 lg:grid-cols-3">
              {packages.map((pkg, index) => (
                <motion.article
                  key={pkg.id}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 32 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{
                    duration: reduceMotion ? 0.2 : 0.6,
                    delay: reduceMotion ? 0 : index * 0.1,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  whileHover={reduceMotion ? undefined : { y: -6 }}
                  className={cn(
                    'relative flex h-full flex-col rounded-3xl border p-7 backdrop-blur-md sm:p-8',
                    pkg.highlighted
                      ? 'border-green-500/50 bg-gradient-to-b from-green-600/[.10] to-white/[.03] shadow-glow lg:-mt-4 lg:pb-12 lg:pt-12'
                      : 'border-hairline bg-white/[.04]',
                  )}
                >
                  {pkg.highlighted ? (
                    <span className="absolute -top-3 left-7 rounded-full bg-green-600 px-3 py-1 font-display text-[11px] uppercase tracking-[0.16em] text-foreground">
                      Mais escolhido
                    </span>
                  ) : null}

                  <h3 className="text-2xl leading-none">{pkg.name}</h3>

                  <p className="mt-5 flex items-baseline gap-1.5">
                    <span className="font-display text-5xl leading-none text-foreground">
                      {pkg.priceLabel}
                    </span>
                    <span className="text-sm text-muted">{pkg.periodLabel}</span>
                  </p>

                  <p className="mt-4 text-sm leading-relaxed text-muted">{pkg.summary}</p>

                  <ul className="mt-7 flex-1 space-y-3 border-t border-hairline pt-7">
                    {pkg.features.map((feature) => (
                      <li key={feature} className="flex gap-3 text-sm text-foreground/90">
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 20 20"
                          className={cn(
                            'mt-0.5 h-4 w-4 shrink-0',
                            pkg.highlighted ? 'text-green-400' : 'text-muted',
                          )}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m4 10.5 4 4 8-9" />
                        </svg>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <a
                    href={whatsappLink(
                      `Olá! Vim pelo site e quero saber mais sobre o pacote ${pkg.name}.`,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      'mt-8 w-full',
                      pkg.highlighted
                        ? 'bg-green-600 text-foreground hover:bg-green-500'
                        : 'btn-secondary',
                    )}
                  >
                    Falar sobre o pacote {pkg.name}
                  </a>
                </motion.article>
              ))}
            </div>
          </div>
        )}

        <Reveal delay={0.1}>
          <p className="mt-10 text-center text-sm text-muted">
            Antes de escolher um plano, você tem duas aulas experimentais gratuitas. Matrícula,
            taxas e formas de pagamento são confirmadas no atendimento.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
