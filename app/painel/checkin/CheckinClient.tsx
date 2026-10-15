'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import type { CheckinResult } from '@/types/domain';

import { checkinAction } from '../actions';

type Phase = 'idle' | 'enviando' | 'ok' | 'erro' | 'escaneando';

/**
 * Check-in do aluno.
 *
 * Caminho principal: a câmera nativa lê o QR da recepção, abre esta página já
 * com `?t=` e a presença é registrada sozinha — sem app, sem digitar nada.
 * O leitor embutido é o plano B, para quem abriu o painel antes de escanear.
 */
export function CheckinClient() {
  const params = useSearchParams();
  const tokenFromUrl = params.get('t') ?? '';
  /** Veio do botão de QR da barra inferior: abre a câmera sem pedir toque. */
  const abrirDireto = params.get('abrir') === '1';

  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<CheckinResult | null>(null);
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const submitted = useRef(false);

  const submit = useCallback(async (token: string) => {
    if (token.trim().length === 0) return;

    setPhase('enviando');
    const response = await checkinAction(token);
    setResult(response);
    setPhase(response.ok ? 'ok' : 'erro');
  }, []);

  // Token veio na URL: registra sem pedir nada ao aluno.
  useEffect(() => {
    if (tokenFromUrl.length > 0 && !submitted.current) {
      submitted.current = true;
      void submit(tokenFromUrl);
    }
  }, [tokenFromUrl, submit]);

  // Encerra a câmera ao sair da tela.
  useEffect(() => {
    return () => {
      void scannerRef.current?.stop().catch(() => undefined);
    };
  }, []);

  const startScanner = useCallback(async () => {
    setPhase('escaneando');
    setResult(null);

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('leitor-qr');
      scannerRef.current = {
        stop: async () => {
          try {
            await scanner.stop();
            scanner.clear();
          } catch {
            // Já estava parado.
          }
        },
      };

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded: string) => {
          void scannerRef.current?.stop();
          // O QR traz a URL completa; extrai o token dela.
          const token = extractToken(decoded);
          void submit(token);
        },
        () => undefined,
      );
    } catch {
      setPhase('erro');
      setResult({
        ok: false,
        reason: 'erro',
        message:
          'Não foi possível abrir a câmera. Libere a permissão no navegador ou use a câmera do celular direto no QR da recepção.',
      });
    }
  }, [submit]);

  // Chegou pelo botão de QR da barra: liga a câmera na hora. O aluno está em
  // pé na recepção — um toque a menos conta.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!abrirDireto || tokenFromUrl.length > 0 || autoStarted.current) return;
    autoStarted.current = true;
    void startScanner();
  }, [abrirDireto, tokenFromUrl, startScanner]);

  return (
    <div className="mx-auto w-full max-w-md">
      {phase === 'ok' && result?.ok ? (
        <div className="rounded-3xl border border-emerald-500/40 bg-emerald-500/[.08] p-8 text-center">
          <span
            aria-hidden="true"
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300"
          >
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 13 4 4L19 7" />
            </svg>
          </span>
          <h2 className="mt-5 text-2xl leading-none">Presença registrada</h2>
          {result.classTitle ? (
            <p className="mt-2 text-sm text-muted">
              {result.classTitle} · {result.at.slice(11, 16)}
            </p>
          ) : null}
          <p className="mt-4 text-sm text-muted">Bom treino!</p>
          <Link href="/painel" className="btn-primary mt-6 w-full">
            Voltar ao painel
          </Link>
        </div>
      ) : null}

      {phase === 'erro' && result && !result.ok ? (
        <div
          role="alert"
          className="rounded-3xl border border-crimson/40 bg-crimson/[.08] p-8 text-center"
        >
          <span
            aria-hidden="true"
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-crimson/20 text-crimson"
          >
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 7v6M12 17h.01" />
              <circle cx="12" cy="12" r="9" strokeWidth="1.8" />
            </svg>
          </span>
          <h2 className="mt-5 text-2xl leading-none">
            {result.reason === 'ja_registrado' ? 'Presença já registrada' : 'Não deu certo'}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">{result.message}</p>

          <div className="mt-6 flex flex-col gap-3">
            <button type="button" onClick={() => void startScanner()} className="btn-primary">
              Escanear novamente
            </button>
            <Link href="/painel" className="btn-secondary">
              Voltar ao painel
            </Link>
          </div>
        </div>
      ) : null}

      {phase === 'enviando' ? (
        <div className="surface-card p-8 text-center">
          <div
            aria-hidden="true"
            className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-hairline border-t-crimson"
          />
          <p aria-live="polite" className="mt-5 text-sm text-muted">
            Registrando sua presença…
          </p>
        </div>
      ) : null}

      <div
        id="leitor-qr"
        className={cn(
          'overflow-hidden rounded-3xl border border-hairline bg-black',
          phase === 'escaneando' ? 'block' : 'hidden',
        )}
      />

      {phase === 'escaneando' ? (
        <p aria-live="polite" className="mt-4 text-center text-sm text-muted">
          Aponte para o QR Code na recepção.
        </p>
      ) : null}

      {phase === 'idle' ? (
        <div className="surface-card p-8 text-center">
          <h2 className="text-2xl leading-none">Registrar presença</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Aponte a câmera do seu celular para o QR Code da recepção — ele abre esta página e
            registra sozinho. Se preferir, use o leitor aqui dentro.
          </p>
          <button type="button" onClick={() => void startScanner()} className="btn-primary mt-6 w-full">
            Abrir leitor de QR
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Aceita tanto a URL completa do QR quanto o token puro. */
function extractToken(decoded: string): string {
  try {
    const url = new URL(decoded);
    return url.searchParams.get('t') ?? '';
  } catch {
    return decoded.trim();
  }
}
