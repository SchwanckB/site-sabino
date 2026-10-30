'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface LogoutButtonProps {
  readonly className?: string;
  readonly label?: string;
}

export function LogoutButton({ className, label = 'Sair' }: LogoutButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (response.ok) {
        router.push('/');
        router.refresh();
      }
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoading}
      className={className}
    >
      {isLoading ? '…' : label}
    </button>
  );
}
