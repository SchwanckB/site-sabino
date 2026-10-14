import type { Metadata } from 'next';
import Link from 'next/link';

import { listMissingServices } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Configuração pendente',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Tela de diagnóstico. Em vez de a aplicação quebrar com "publishable key not
 * valid", ela diz exatamente qual variável falta e onde consegui-la.
 */
export default function ConfigurarPage() {
  const missing = listMissingServices();
  const ready = missing.filter((item) => item.required).length === 0;

  return (
    <main id="conteudo" className="flex min-h-dvh items-center justify-center px-5 py-16">
      <div className="w-full max-w-2xl">
        <p className="eyebrow">Configuração</p>
        <h1 className="mt-3 text-3xl leading-none sm:text-4xl">
          {ready ? 'Tudo pronto por aqui' : 'Falta configurar o acesso'}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
          {ready
            ? 'Os serviços obrigatórios estão configurados. Se você chegou nesta tela, tente entrar novamente.'
            : 'A área de alunos e o painel do administrador precisam dos serviços abaixo. A landing page continua funcionando normalmente sem eles.'}
        </p>

        {missing.length > 0 ? (
          <ul className="mt-10 space-y-4">
            {missing.map((service) => (
              <li key={service.key} className="surface-card p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg normal-case tracking-normal">{service.label}</h2>
                  <span
                    className={
                      service.required
                        ? 'rounded-full bg-crimson/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-crimson'
                        : 'rounded-full border border-hairline px-2.5 py-1 text-[11px] uppercase tracking-wider text-muted'
                    }
                  >
                    {service.required ? 'Obrigatório' : 'Opcional'}
                  </span>
                </div>

                <p className="mt-3 text-sm text-muted">
                  Onde conseguir: <span className="text-foreground">{service.where}</span>
                </p>

                <ul className="mt-3 space-y-1">
                  {service.envVars.map((name) => (
                    <li
                      key={name}
                      className="overflow-x-auto rounded-lg border border-hairline bg-white/[.03] px-3 py-2 font-mono text-xs text-foreground"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="surface-card mt-8 p-5 text-sm leading-relaxed text-muted sm:p-6">
          <p className="font-medium text-foreground">Onde colocar essas variáveis</p>
          <p className="mt-2">
            Local: no arquivo <span className="font-mono text-xs">.env.local</span> na raiz do
            projeto. Produção: na Vercel, em{' '}
            <span className="text-foreground">Settings → Environment Variables</span>, nos três
            ambientes. Depois de salvar, faça um <span className="text-foreground">Redeploy</span>{' '}
            — variável de ambiente só vale a partir do próximo build.
          </p>
        </div>

        <Link href="/" className="btn-secondary mt-8">
          Voltar para o site
        </Link>
      </div>
    </main>
  );
}
