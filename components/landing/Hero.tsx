'use client';

import { motion, useReducedMotion } from 'framer-motion';
import Image from 'next/image';

import { stats } from '@/data/seed';
import { siteConfig, whatsappLink, whatsappMessages } from '@/lib/site';

export function Hero() {
  const reduceMotion = useReducedMotion();

  const rise = (delay: number) => ({
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: reduceMotion ? 0.25 : 0.7,
      delay: reduceMotion ? 0 : delay,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  });

  return (
    <section className="grain relative isolate overflow-hidden pb-20 pt-32 sm:pb-24 sm:pt-36 lg:pb-32 lg:pt-44">
      {/* Foto de impacto. Troque /public/images/hero-tatame.jpg pela imagem real. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <Image
          src="/images/hero-tatame.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center opacity-[.28]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/85 to-ink" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/60 to-transparent" />
      </div>

      {/* Halo carmesim discreto atras do conteudo. */}
      <div
        aria-hidden="true"
        className="absolute -right-24 top-10 -z-10 h-[32rem] w-[32rem] rounded-full bg-crimson/10 blur-[120px]"
      />

      <div className="container-page">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)] lg:gap-16">
          <div className="max-w-2xl">
            <motion.p {...rise(0.05)} className="eyebrow">
              {siteConfig.city}/{siteConfig.state} &middot; litoral gaucho
            </motion.p>

            <motion.h1
              {...rise(0.12)}
              className="mt-4 text-[2.75rem] leading-[0.95] sm:text-6xl lg:text-7xl"
            >
              Jiu-Jitsu e MMA
              <span className="mt-1 block text-crimson">no tatame certo</span>
            </motion.h1>

            <motion.p
              {...rise(0.2)}
              className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg"
            >
              Turmas para quem nunca lutou e para quem ja compete. Em {siteConfig.city}, a
              poucos minutos da praia, com professor no tatame corrigindo aluno por aluno.
            </motion.p>

            <motion.div {...rise(0.28)} className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href={whatsappLink(whatsappMessages.trial)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary sm:px-7"
              >
                Agendar aula experimental
              </a>
              <a href="#planos" className="btn-secondary sm:px-7">
                Ver planos e horarios
              </a>
            </motion.div>

            <motion.dl
              {...rise(0.36)}
              className="mt-12 grid max-w-lg grid-cols-3 gap-4 border-t border-hairline pt-8"
            >
              {stats.map((stat) => (
                <div key={stat.id}>
                  <dt className="sr-only">{stat.label}</dt>
                  <dd>
                    <span className="block font-display text-3xl leading-none text-foreground sm:text-4xl">
                      {stat.value}
                    </span>
                    <span className="mt-1.5 block text-xs leading-snug text-muted sm:text-sm">
                      {stat.label}
                    </span>
                  </dd>
                </div>
              ))}
            </motion.dl>
          </div>

          {/* A logo fecha a composicao do lado direito, deslocada do centro. */}
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: reduceMotion ? 0.25 : 0.9,
              delay: reduceMotion ? 0 : 0.25,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="relative mx-auto hidden w-full max-w-md lg:block"
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 -z-10 rounded-full bg-crimson/[.07] blur-3xl"
            />
            <Image
              src="/logo-light.png"
              alt={`Logo da ${siteConfig.name}`}
              width={1400}
              height={1204}
              priority
              sizes="(min-width: 1024px) 28rem, 0px"
              className="h-auto w-full drop-shadow-2xl"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
