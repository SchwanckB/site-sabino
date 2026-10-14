import Image from 'next/image';

import { formatAddress, navLinks, siteConfig, whatsappLink, whatsappMessages } from '@/lib/site';

export function Footer() {
  return (
    <footer className="border-t border-hairline bg-ink">
      <div className="container-page py-14 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Image
              src="/logo-light.png"
              alt={`${siteConfig.name} - Jiu-Jitsu e MMA`}
              width={1400}
              height={1204}
              sizes="200px"
              className="h-16 w-auto"
            />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted">
              {siteConfig.tagline}. Turmas de Jiu-Jitsu, MMA e Kids com acompanhamento de
              graduacao do primeiro dia em diante.
            </p>

            <ul className="mt-6 flex gap-3">
              <li>
                <a
                  href={siteConfig.social.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram da Sabino Academia"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-hairline bg-white/[.04] text-muted transition-colors hover:border-white/20 hover:text-foreground"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="3" y="3" width="18" height="18" rx="5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                  </svg>
                </a>
              </li>
              <li>
                <a
                  href={siteConfig.social.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook da Sabino Academia"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-hairline bg-white/[.04] text-muted transition-colors hover:border-white/20 hover:text-foreground"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M14.5 8.5h2.5V5.5h-2.5c-2 0-3.5 1.5-3.5 3.5v2H8.5v3H11v6.5h3V14h2.5l.5-3H14v-1.5c0-.6.4-1 .5-1Z" />
                  </svg>
                </a>
              </li>
            </ul>
            {siteConfig.social.isExample ? (
              <p className="mt-3 text-[11px] text-muted/70">
                Links de redes sociais ainda sao placeholders.
              </p>
            ) : null}
          </div>

          <nav aria-label="Navegacao do rodape">
            <h2 className="text-sm tracking-[0.18em] text-foreground">Navegue</h2>
            <ul className="mt-4 space-y-1">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="inline-flex min-h-[44px] items-center text-sm text-muted transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="text-sm tracking-[0.18em] text-foreground">Contato</h2>
            <address className="mt-4 space-y-3 text-sm not-italic text-muted">
              <p>{formatAddress()}</p>
              <p>
                <a
                  href={whatsappLink(whatsappMessages.trial)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center transition-colors hover:text-foreground"
                >
                  {siteConfig.phoneDisplay}
                </a>
              </p>
            </address>

            <a
              href={whatsappLink(whatsappMessages.trial)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary mt-4 w-full"
            >
              Aula experimental
            </a>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-hairline pt-7 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {siteConfig.legalName}. Todos os direitos reservados.
          </p>
          <p>
            {siteConfig.city}/{siteConfig.state} &middot; {siteConfig.stateName}
          </p>
        </div>
      </div>
    </footer>
  );
}
