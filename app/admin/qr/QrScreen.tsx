'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

interface QrState {
  readonly dataUrl: string;
  readonly expiresIn: number;
}

/**
 * Tela da recepção: QR em tela cheia que gira sozinho.
 *
 * A rotação é o que impede check-in remoto — uma foto do código mandada no
 * WhatsApp deixa de valer na próxima janela. O recarregamento acontece um
 * pouco antes de expirar, para nunca exibir um código já morto.
 */
export function QrScreen() {
  const [qr, setQr] = useState<QrState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (rotate: boolean) => {
    try {
      const response = await fetch(`/api/admin/qr${rotate ? '?rotate=1' : ''}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message =
          body && typeof body === 'object' && 'error' in body
            ? String((body as { error: unknown }).error)
            : 'Não foi possível gerar o código.';
        setError(message);
        return;
      }

      const data = (await response.json()) as QrState;
      setQr(data);
      setSecondsLeft(data.expiresIn);
      setError(null);
    } catch {
      setError('Sem conexão com o servidor.');
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  // Contagem regressiva; recarrega 3s antes de expirar.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 4) {
          void load(true);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [load]);

  const toggleFullscreen = useCallback(async () => {
    const element = containerRef.current;
    if (!element) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setFullscreen(false);
      } else {
        await element.requestFullscreen();
        setFullscreen(true);
      }
    } catch {
      // Alguns navegadores bloqueiam; a tela segue utilizável sem isso.
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col items-center',
        fullscreen && 'h-dvh w-dvw justify-center bg-ink p-6',
      )}
    >
      {error ? (
        <div
          role="alert"
          className="w-full max-w-md rounded-2xl border border-crimson/40 bg-crimson/[.08] px-5 py-8 text-center"
        >
          <p className="font-display text-lg uppercase tracking-tight">Não foi possível gerar</p>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <button type="button" onClick={() => void load(true)} className="btn-secondary mt-5">
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-3xl border border-hairline bg-white p-4 sm:p-6">
            {qr ? (
              <Image
                src={qr.dataUrl}
                alt="QR Code de presença da recepção"
                width={720}
                height={720}
                unoptimized
                priority
                className="h-auto w-[min(72vw,22rem)] sm:w-[min(60vw,26rem)]"
              />
            ) : (
              <div className="h-[min(72vw,22rem)] w-[min(72vw,22rem)] animate-pulse rounded-xl bg-black/10 sm:h-[min(60vw,26rem)] sm:w-[min(60vw,26rem)]" />
            )}
          </div>

          <div className="mt-6 text-center">
            <p className="font-display text-2xl uppercase tracking-tight sm:text-3xl">
              Aponte a câmera do celular
            </p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
              A presença é registrada na hora. Pais podem usar o próprio aparelho para o
              check-in da criança.
            </p>

            <p
              aria-live="off"
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-hairline bg-white/[.04] px-4 py-2 text-sm text-muted"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'h-2 w-2 rounded-full',
                  secondsLeft > 10 ? 'bg-emerald-400' : 'bg-crimson',
                )}
              />
              Novo código em{' '}
              <span className="tabular-nums text-foreground">{secondsLeft}s</span>
            </p>
          </div>
        </>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => void toggleFullscreen()} className="btn-secondary">
          {fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        </button>
        <button type="button" onClick={() => void load(true)} className="btn-ghost">
          Gerar novo agora
        </button>
      </div>
    </div>
  );
}
