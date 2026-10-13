'use client';

import { motion, useReducedMotion } from 'framer-motion';

import { Reveal, SectionHeading } from '@/components/ui/Reveal';
import { EXAMPLE_DATA_NOTICE, plans } from '@/data/seed';
import { whatsappLink } from '@/lib/site';
import { cn } from '@/lib/utils';

export function Plans() {
  const reduceMotion = useReducedMotion();
  const hasExampleData = plans.some((plan) => plan.isExample);

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
          title="Escolha o compromisso, nao o desconto"
          description="Todos os planos dao acesso ao app do aluno, com check-in, historico de treinos e status da mensalidade."
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

        <div className="mt-14 grid items-start gap-5 lg:grid-cols-3">
          {plans.map((plan, index) => (
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

              <p className="mt-5 flex items-baseline gap-1.5">
                <span className="font-display text-5xl leading-none text-foreground">
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
                        plan.highlighted ? 'text-crimson' : 'text-muted',
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
                  `Ola! Vim pelo site e quero saber mais sobre o plano ${plan.name}.`,
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

        <Reveal delay={0.1}>
          <p className="mt-10 text-center text-sm text-muted">
            Matricula, taxas e formas de pagamento sao confirmadas no atendimento.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
