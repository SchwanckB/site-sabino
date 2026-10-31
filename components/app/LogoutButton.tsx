'use client';

import { useClerk } from '@clerk/nextjs';
import { useState } from 'react';

/**
 * Sair da conta.
 *
 * Usa o `signOut()` do Clerk em vez de uma rota própria. A rota anterior
 * chamava `revokeSession` e devolvia um redirect, e isso trazia quatro
 * problemas de uma vez:
 *
 *   - o destino caía em `http://localhost:3000` quando faltava a variável de
 *     ambiente, o que em produção levava o usuário a lugar nenhum;
 *   - a exceção de `revokeSession` era engolida e a rota respondia sucesso, de
 *     modo que um logout falhado parecia ter funcionado e a sessão continuava
 *     de pé;
 *   - era um POST sem proteção contra CSRF;
 *   - `revokeSession` encerra a sessão no servidor mas não apaga o cookie do
 *     navegador, deixando uma janela em que o app ainda parecia logado.
 *
 * `signOut()` resolve os quatro: encerra a sessão e limpa o cookie, sem
 * endpoint nosso no meio. O `redirectUrl` é relativo, então não existe host
 * para errar.
 */

interface LogoutButtonProps {
  readonly className?: string;
  readonly label?: string;
}

export function LogoutButton({ className, label = 'Sair' }: LogoutButtonProps) {
  const { signOut } = useClerk();
  const [isLoading, setIsLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleLogout = async () => {
    setIsLoading(true);
    setFailed(false);

    try {
      await signOut({ redirectUrl: '/' });
    } catch (error) {
      // Falhar calado deixaria o botão travado em "…" para sempre, que foi
      // exatamente o defeito anterior. Volta ao estado clicável e avisa.
      console.error('[logout] falha ao encerrar a sessão', error);
      setFailed(true);
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoading}
      className={className}
      title={failed ? 'Não foi possível sair. Tente novamente.' : undefined}
    >
      {isLoading ? '…' : failed ? 'Tentar sair novamente' : label}
    </button>
  );
}
