import { SignUp } from '@clerk/nextjs';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Criar conta',
  robots: { index: false, follow: false },
};

export default function CadastroPage() {
  return (
    <main id="conteudo" className="flex min-h-dvh flex-col items-center justify-center px-5 py-16">
      <div className="mb-8 max-w-md text-center">
        <p className="eyebrow">Pré-cadastro</p>
        <h1 className="mt-3 text-3xl leading-none">Comece criando sua conta</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Depois disso você completa a ficha e a academia aprova sua matrícula.
        </p>
      </div>
      <SignUp
        signInUrl="/entrar"
        fallbackRedirectUrl="/onboarding"
        forceRedirectUrl="/onboarding"
      />
    </main>
  );
}
