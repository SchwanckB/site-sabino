import { SignIn } from '@clerk/nextjs';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Entrar',
  robots: { index: false, follow: false },
};

export default function EntrarPage() {
  return (
    <main id="conteudo" className="flex min-h-dvh items-center justify-center px-5 py-16">
      <SignIn
        signUpUrl="/cadastro"
        fallbackRedirectUrl="/painel"
        signUpFallbackRedirectUrl="/onboarding"
      />
    </main>
  );
}
