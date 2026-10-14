import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { requireUser } from '@/lib/auth';
import { getStudent } from '@/lib/repositories/students';
import { siteConfig, whatsappLink } from '@/lib/site';
import { STATUS_LABELS } from '@/types/domain';

export const metadata: Metadata = {
  title: 'Cadastro em análise',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AguardandoPage() {
  const user = await requireUser();
  const student = await getStudent(user.id);

  if (!student) redirect('/onboarding');
  if (student.status === 'ativo') redirect('/painel');
  if (student.status === 'recusado') redirect('/onboarding');

  return (
    <main id="conteudo" className="flex min-h-dvh items-center justify-center px-5 py-16">
      <div className="w-full max-w-lg text-center">
        <span
          aria-hidden="true"
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-hairline bg-white/[.04]"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-crimson" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" strokeLinecap="round" />
          </svg>
        </span>

        <h1 className="mt-6 text-3xl leading-none">Cadastro em análise</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
          Recebemos sua ficha, {student.name.split(' ')[0]}. A academia vai conferir os dados e
          liberar seu acesso ao painel. Status atual:{' '}
          <span className="text-foreground">{STATUS_LABELS[student.status]}</span>.
        </p>

        <div className="surface-card mt-8 p-5 text-left text-sm leading-relaxed text-muted">
          <p className="font-medium text-foreground">Quer agilizar?</p>
          <p className="mt-2">
            Fale com a recepção pelo WhatsApp em horário comercial, ou pessoalmente durante os
            treinos, de segunda a sexta, das 18h30 às 21h30.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href={whatsappLink('Olá! Enviei meu cadastro pelo site e gostaria de confirmar.')}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
          >
            Falar no WhatsApp
          </a>
          <Link href="/" className="btn-secondary">
            Voltar para o site
          </Link>
        </div>

        <p className="mt-6 text-xs text-muted">{siteConfig.phoneDisplay}</p>
      </div>
    </main>
  );
}
