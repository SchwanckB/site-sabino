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
              {siteConfig.tagline}. Jiu-Jitsu, MMA, turma feminina e aulas infantis a partir
              dos 4 anos, com acompanhamento de graduação do primeiro dia em diante.
            </p>

            <ul className="mt-6 flex gap-3">
              <li>
                <a
                  href={siteConfig.social.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Instagram da Sabino Academia (${siteConfig.social.instagramHandle})`}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-hairline bg-white/[.04] text-muted transition-colors hover:border-white/20 hover:text-foreground"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                  </svg>
                </a>
              </li>
              <li>
                <a
                  href={whatsappLink(whatsappMessages.trial)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp da Sabino Academia"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-hairline bg-white/[.04] text-muted transition-colors hover:border-white/20 hover:text-foreground"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.41a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.17.24-.64.8-.79.97-.14.16-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.06s.89 2.39 1.01 2.56c.12.16 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.23-.17-.48-.29Z" />
                  </svg>
                </a>
              </li>
            </ul>
          </div>

          <nav aria-label="Navegação do rodapé">
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
              <p>
                {formatAddress()}
                <span className="block">{siteConfig.address.reference}</span>
              </p>
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
              <p className="text-xs leading-relaxed">
                {siteConfig.openingHours.whatsapp}.
                <br />
                {siteConfig.openingHours.reception}.
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
          <p>&copy; {siteConfig.legalName}. Todos os direitos reservados.</p>
          <p>
            {siteConfig.city}/{siteConfig.state} &middot; {siteConfig.stateName}
          </p>
        </div>
      </div>
    </footer>
  );
}
