'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import type { CheckinResult } from '@/types/domain';

import { checkinAction, listCheckinOptions, type OpenClassOption } from '../actions';

type Phase = 'idle' | 'carregando' | 'escolhendo' | 'enviando' | 'ok' | 'erro' | 'escaneando';

/**
 * Check-in do aluno.
 *
 * Caminho principal: a câmera nativa lê o QR da parede, abre esta página já
 * com `?t=` e a tela pergunta **qual aula** — entre as turmas do aluno que
 * estão acontecendo naquele momento. Havendo uma só, registra sozinha: é o
 * caso da grande maioria das noites, e perguntar ali seria toque à toa.
 *
 * O leitor embutido é o plano B, para quem abriu o painel antes de escanear.
 */
export function CheckinClient() {
  const params = useSearchParams();
  const tokenFromUrl = params.get('t') ?? '';
  /** Veio do botão de QR da barra inferior: abre a câmera sem pedir toque. */
  const abrirDireto = params.get('abrir') === '1';

  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [opcoes, setOpcoes] = useState<readonly OpenClassOption[]>([]);
  const [token, setToken] = useState('');
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const resolvido = useRef(false);

  const registrar = useCallback(async (codigo: string, classId: string) => {
    setPhase('enviando');
    const response = await checkinAction(codigo, classId);
    setResult(response);
    setPhase(response.ok ? 'ok' : 'erro');
  }, []);

  /** Resolve o código: carrega as turmas abertas e decide se precisa perguntar. */
  const resolver = useCallback(
    async (codigo: string) => {
      const limpo = codigo.trim();
      if (limpo.length === 0) return;

      setToken(limpo);
      setPhase('carregando');

      const options = await listCheckinOptions(limpo);
      if (!options.ok) {
        setResult({ ok: false, reason: 'qr_invalido', message: options.message });
        setPhase('erro');
        return;
      }

      if (options.classes.length === 0) {
        setResult({
          ok: false,
          reason: 'sem_aula_agora',
          message:
            'Nenhuma das suas turmas está acontecendo agora. O check-in vale no horário do treino.',
        });
        setPhase('erro');
        return;
      }

      // Uma aula só: não há o que escolher.
      const unica = options.classes[0];
      if (options.classes.length === 1 && unica) {
        await registrar(limpo, unica.classId);
        return;
      }

      setOpcoes(options.classes);
      setPhase('escolhendo');
    },
    [registrar],
  );

  // Código veio na URL: resolve sem pedir nada ao aluno.
  useEffect(() => {
    if (tokenFromUrl.length > 0 && !resolvido.current) {
      resolvido.current = true;
      void resolver(tokenFromUrl);
    }
  }, [tokenFromUrl, resolver]);

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
          void resolver(extractToken(decoded));
        },
        () => undefined,
      );
    } catch {
      setPhase('erro');
      setResult({
        ok: false,
        reason: 'erro',
        message:
          'Não foi possível abrir a câmera. Libere a permissão no navegador ou use a câmera do celular direto no QR da academia.',
      });
    }
  }, [resolver]);

  // Chegou pelo botão de QR da barra: liga a câmera na hora.
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

      {/* Escolha da aula: só aparece quando há mais de uma no horário. */}
      {phase === 'escolhendo' ? (
        <div className="surface-card p-6">
          <h2 className="text-xl leading-none">Qual aula?</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Você tem mais de uma turma neste horário. Toque na que vai treinar.
          </p>

          <ul className="mt-5 space-y-2">
            {opcoes.map((option) => (
              <li key={option.classId}>
                <button
                  type="button"
                  onClick={() => void registrar(token, option.classId)}
                  className="flex min-h-[60px] w-full items-center justify-between gap-3 rounded-xl border border-hairline bg-white/[.04] px-4 text-left transition-colors hover:border-crimson/50 hover:bg-crimson/[.07]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {option.title}
                    </span>
                    {option.level ? (
                      <span className="block truncate text-xs text-muted">{option.level}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-display text-sm tabular-nums text-muted">
                    {option.time}
                  </span>
                </button>
              </li>
            ))}
          </ul>
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

      {phase === 'enviando' || phase === 'carregando' ? (
        <div className="surface-card p-8 text-center">
          <div
            aria-hidden="true"
            className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-hairline border-t-crimson"
          />
          <p aria-live="polite" className="mt-5 text-sm text-muted">
            {phase === 'carregando' ? 'Lendo o código…' : 'Registrando sua presença…'}
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
          Aponte para o QR Code da academia.
        </p>
      ) : null}

      {phase === 'idle' ? (
        <div className="surface-card p-8 text-center">
          <h2 className="text-2xl leading-none">Registrar presença</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Aponte a câmera do seu celular para o QR Code da academia — ele abre esta página e
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

/** Aceita tanto a URL completa do QR quanto o código puro. */
function extractToken(decoded: string): string {
  try {
    const url = new URL(decoded);
    return url.searchParams.get('t') ?? '';
  } catch {
    return decoded.trim();
  }
}
