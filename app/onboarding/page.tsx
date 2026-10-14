import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireUser } from '@/lib/auth';
import { isBlobConfigured } from '@/lib/env';
import { getStudent } from '@/lib/repositories/students';

import { OnboardingForm } from './OnboardingForm';

export const metadata: Metadata = {
  title: 'Complete seu cadastro',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const user = await requireUser();
  const existing = await getStudent(user.id);

  // Já aprovado vai direto para o painel; já enviado vai para a espera.
  if (existing?.status === 'ativo') redirect('/painel');
  if (existing?.status === 'pendente') redirect('/aguardando');

  return (
    <main id="conteudo" className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-16">
      <p className="eyebrow">Pré-cadastro</p>
      <h1 className="mt-3 text-3xl leading-none sm:text-4xl">Complete sua ficha</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
        A academia confere os dados e libera seu acesso. Você recebe o aviso assim que a
        matrícula for aprovada.
      </p>

      {existing?.status === 'recusado' && existing.rejectionReason ? (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-crimson/40 bg-crimson/[.08] px-4 py-3 text-sm leading-relaxed"
        >
          <p className="font-medium text-foreground">Seu cadastro anterior foi recusado</p>
          <p className="mt-1 text-muted">{existing.rejectionReason}</p>
          <p className="mt-2 text-muted">Corrija os dados abaixo e envie novamente.</p>
        </div>
      ) : null}

      <div className="mt-10">
        <OnboardingForm
          defaultName={existing?.name ?? user.name}
          defaultPhone={existing?.phone ?? ''}
          defaultBirthDate={existing?.birthDate ?? ''}
          hasDocument={Boolean(existing?.docBlobKey)}
          documentEnabled={isBlobConfigured()}
        />
      </div>
    </main>
  );
}
