'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import type { CheckinResult } from '@/types/domain';
import { saoPauloTimeString } from '@/utils/datetime';
import { extractToken } from '@/utils/qrToken';

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

  /*
   * Trava de envio em andamento.
   *
   * Dedo nervoso na porta da academia toca duas vezes no mesmo botão, e os dois
   * toques disparam antes de o React re-renderizar — `disabled` sozinho não
   * pega o segundo. O servidor mantém a integridade pelo `SET NX`, mas a
   * segunda chamada voltava `ja_registrado` e a tela mostrava "Presença já
   * registrada" num check-in que acabara de dar certo. O aluno achava que
   * falhou e ia chamar a recepção.
   */
  const enviando = useRef(false);

  const registrar = useCallback(async (codigo: string, classId: string) => {
    if (enviando.current) return;
    enviando.current = true;

    setPhase('enviando');
    try {
      const response = await checkinAction(codigo, classId);
      setResult(response);
      setPhase(response.ok ? 'ok' : 'erro');
    } catch {
      setResult({
        ok: false,
        reason: 'erro',
        message: 'A conexão caiu no meio do envio. Confira com a recepção antes de treinar.',
      });
      setPhase('erro');
    } finally {
      enviando.current = false;
    }
  }, []);

  /** Resolve o código: carrega as turmas abertas e decide se precisa perguntar. */
  const resolver = useCallback(
    async (codigo: string | null) => {
      /*
       * Código ausente tem de virar erro visível, não retorno silencioso.
       *
       * O leitor aceita qualquer QR, e o aluno vai apontar para QR de Wi-Fi, de
       * nota fiscal e de rede social. Antes a função simplesmente retornava: a
       * câmera já tinha sido parada, a tela ficava no estado de escaneamento e o
       * aluno encarava um retângulo preto sem mensagem e sem botão, com
       * recarregar a página como única saída.
       */
      const limpo = codigo?.trim() ?? '';
      if (limpo.length === 0) {
        setResult({
          ok: false,
          reason: 'qr_invalido',
          message:
            'Esse código não é o da academia. Aponte para o cartaz de check-in na parede.',
        });
        setPhase('erro');
        return;
      }

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
          // A mesma frase do servidor: o aluno não deve ler uma coisa quando a
          // tela recusa e outra quando o registro recusa.
          message: options.nextClass
            ? `Nenhuma das suas turmas está acontecendo agora. A próxima é ${options.nextClass}.`
            : 'Você ainda não está em nenhuma turma. Fale com a recepção.',
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
              {result.classTitle} · {saoPauloTimeString(result.at)}
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
        <div className="panel p-6">
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
                  disabled={phase !== 'escolhendo'}
                  className="flex min-h-[60px] w-full items-center justify-between gap-3 rounded-xl border border-hairline bg-white/[.04] px-4 text-left transition-colors hover:border-crimson/50 hover:bg-crimson/[.07] disabled:opacity-50"
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
        <div className="panel p-8 text-center">
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
        <div className="panel p-8 text-center">
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

