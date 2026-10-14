'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';

import { Reveal, SectionHeading } from '@/components/ui/Reveal';
import { faq } from '@/data/seed';
import { whatsappLink, whatsappMessages } from '@/lib/site';
import { cn } from '@/lib/utils';

export function Faq() {
  const [openId, setOpenId] = useState<string | null>(faq[0]?.id ?? null);
  const reduceMotion = useReducedMotion();

  return (
    <section id="duvidas" aria-labelledby="duvidas-titulo" className="py-20 sm:py-24 lg:py-32">
      <div className="container-page">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:gap-20">
          <div>
            <SectionHeading
              id="duvidas-titulo"
              eyebrow="Dúvidas"
              title={
                <>
                  Antes da
                  <br />
                  primeira aula
                </>
              }
            />

            <Reveal delay={0.12} className="mt-8">
              <div className="surface-card p-6">
                <p className="text-sm leading-relaxed text-muted">
                  As duas primeiras aulas são gratuitas. Ficou alguma dúvida que não está aqui?
                  Chama no WhatsApp em horário comercial, ou passa na recepção durante os
                  treinos.
                </p>
                <a
                  href={whatsappLink(whatsappMessages.trial)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary mt-5 w-full"
                >
                  Falar no WhatsApp
                </a>
              </div>
            </Reveal>
          </div>

          <Reveal direction="left">
            <ul className="divide-y divide-hairline border-y border-hairline">
              {faq.map((item) => {
                const isOpen = openId === item.id;
                const panelId = `faq-painel-${item.id}`;
                const buttonId = `faq-botao-${item.id}`;

                return (
                  <li key={item.id}>
                    <h3>
                      <button
                        id={buttonId}
                        type="button"
                        onClick={() => setOpenId(isOpen ? null : item.id)}
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        className="flex w-full items-start gap-4 py-5 text-left transition-colors duration-300 hover:text-crimson"
                      >
                        <span className="flex-1 font-display text-lg uppercase leading-snug tracking-tight sm:text-xl">
                          {item.question}
                        </span>
                        <motion.span
                          aria-hidden="true"
                          animate={{ rotate: isOpen ? 45 : 0 }}
                          transition={{
                            duration: reduceMotion ? 0 : 0.3,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          className={cn(
                            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-lg leading-none',
                            isOpen ? 'border-crimson text-crimson' : 'border-hairline text-muted',
                          )}
                        >
                          +
                        </motion.span>
                      </button>
                    </h3>

                    <AnimatePresence initial={false}>
                      {isOpen ? (
                        <motion.div
                          key="painel"
                          id={panelId}
                          role="region"
                          aria-labelledby={buttonId}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{
                            duration: reduceMotion ? 0.12 : 0.4,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          className="overflow-hidden"
                        >
                          <p className="pb-6 pr-11 text-sm leading-relaxed text-muted sm:text-base">
                            {item.answer}
                          </p>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
