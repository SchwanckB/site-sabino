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
                  {siteConfig.city}, no
                  <br />
                  litoral gaucho
                </>
              }
              description="A um passo da praia e com estacionamento na rua. Chegue 10 minutos antes na primeira visita."
            />

            <Reveal delay={0.1} className="mt-8">
              <dl className="space-y-6">
                <div>
                  <dt className="text-xs uppercase tracking-[0.18em] text-muted">Endereco</dt>
                  <dd className="mt-1.5 text-base text-foreground">
                    {formatAddress()}
                    {siteConfig.address.isExample ? (
                      <span className="ml-2 rounded-full border border-dashed border-crimson/50 px-2 py-0.5 align-middle text-[10px] uppercase tracking-wider text-muted">
                        exemplo
                      </span>
                    ) : null}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs uppercase tracking-[0.18em] text-muted">WhatsApp</dt>
                  <dd className="mt-1.5">
                    <a
                      href={whatsappLink(whatsappMessages.trial)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[44px] items-center text-base text-foreground underline decoration-crimson decoration-2 underline-offset-4 transition-colors hover:text-crimson"
                    >
                      {siteConfig.phoneDisplay}
                    </a>
                  </dd>
                </div>

                <div>
                  <dt className="text-xs uppercase tracking-[0.18em] text-muted">
                    Atendimento da recepcao
                    {siteConfig.openingHours.isExample ? (
                      <span className="ml-2 rounded-full border border-dashed border-crimson/50 px-2 py-0.5 align-middle text-[10px] uppercase tracking-wider text-muted">
                        exemplo
                      </span>
                    ) : null}
                  </dt>
                  <dd className="mt-1.5 space-y-0.5 text-base text-foreground">
                    <p>{siteConfig.openingHours.weekdays}</p>
                    <p>{siteConfig.openingHours.saturday}</p>
                    <p className="text-muted">{siteConfig.openingHours.sunday}</p>
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
                title={`Mapa de ${siteConfig.city}/${siteConfig.state}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
                className="h-[22rem] w-full border-0 grayscale-[.4] contrast-[1.1] sm:h-[26rem] lg:h-[30rem]"
              />
            </div>
            <p className="mt-3 text-xs text-muted">
              O mapa mostra {siteConfig.city}/{siteConfig.state}. Troque o `mapEmbedUrl` em
              `lib/site.ts` pelo endereco exato quando ele for confirmado.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
