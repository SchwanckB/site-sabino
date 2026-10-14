import { Reveal, SectionHeading } from '@/components/ui/Reveal';
import { formatAddress, siteConfig, whatsappLink, whatsappMessages } from '@/lib/site';

export function LocationSection() {
  return (
    <section
      id="onde-estamos"
      aria-labelledby="onde-estamos-titulo"
      className="relative border-t border-hairline bg-surface/40 py-20 sm:py-24 lg:py-32"
    >
      <div className="container-page">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-16">
          <div>
            <SectionHeading
              id="onde-estamos-titulo"
              eyebrow="Onde estamos"
              title={
                <>
                  No centro de
                  <br />
                  {siteConfig.city}
                </>
              }
              description={`Na ${siteConfig.address.street}, ${siteConfig.address.reference}. Chegue 10 minutos antes na primeira visita para falar com o professor.`}
            />

            <Reveal delay={0.1} className="mt-8">
              <dl className="space-y-6">
                <div>
                  <dt className="text-xs uppercase tracking-[0.18em] text-muted">Endereço</dt>
                  <dd className="mt-1.5 text-base text-foreground">
                    {formatAddress()}
                    <span className="mt-0.5 block text-sm text-muted">
                      {siteConfig.address.reference}
                    </span>
                  </dd>
                </div>

                <div>
                  <dt className="text-xs uppercase tracking-[0.18em] text-muted">
                    Atendimento
                  </dt>
                  <dd className="mt-1.5 space-y-1 text-base text-foreground">
                    <p>{siteConfig.openingHours.whatsapp}</p>
                    <p className="text-muted">{siteConfig.openingHours.reception}</p>
                  </dd>
                </div>

                <div>
                  <dt className="text-xs uppercase tracking-[0.18em] text-muted">Contato</dt>
                  <dd className="mt-1.5 flex flex-wrap items-center gap-x-5">
                    <a
                      href={whatsappLink(whatsappMessages.trial)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[44px] items-center text-base text-foreground underline decoration-crimson decoration-2 underline-offset-4 transition-colors hover:text-crimson"
                    >
                      {siteConfig.phoneDisplay}
                    </a>
                    <a
                      href={siteConfig.social.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[44px] items-center text-base text-muted transition-colors hover:text-foreground"
                    >
                      {siteConfig.social.instagramHandle}
                    </a>
                  </dd>
                </div>
              </dl>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href={siteConfig.mapLinkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                >
                  Abrir no Google Maps
                </a>
                <a
                  href={whatsappLink(whatsappMessages.trial)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                >
                  Agendar visita
                </a>
              </div>
            </Reveal>
          </div>

          <Reveal direction="left" delay={0.08}>
            <div className="overflow-hidden rounded-3xl border border-hairline">
              <iframe
                src={siteConfig.mapEmbedUrl}
                title={`Mapa da Sabino Academia em ${siteConfig.city}/${siteConfig.state}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
                className="h-[22rem] w-full border-0 sm:h-[26rem] lg:h-[30rem]"
              />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
