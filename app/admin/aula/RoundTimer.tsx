'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * Cronômetro de rounds.
 *
 * Roda inteiro no navegador — nenhuma chamada ao servidor. É de propósito: o
 * tatame costuma ser o pior ponto de sinal da academia, e um cronômetro que
 * depende de rede é um cronômetro que para no meio do treino.
 *
 * O apito é gerado com WebAudio em vez de arquivo de som: não há o que baixar
 * e funciona mesmo sem internet depois que a página abriu.
 */

const PRESETS: readonly { label: string; round: number; rest: number }[] = [
  { label: '3 × 1', round: 180, rest: 60 },
  { label: '5 × 1', round: 300, rest: 60 },
  { label: '6 × 1', round: 360, rest: 60 },
  { label: '8 × 2', round: 480, rest: 120 },
];

type Fase = 'parado' | 'round' | 'descanso';

export function RoundTimer() {
  const [preset, setPreset] = useState(PRESETS[1] ?? { label: '5 × 1', round: 300, rest: 60 });
  const [fase, setFase] = useState<Fase>('parado');
  const [restante, setRestante] = useState(preset.round);
  const [round, setRound] = useState(1);

  const audioRef = useRef<AudioContext | null>(null);

  const apitar = useCallback((longo: boolean) => {
    try {
      // O contexto só pode nascer depois de um toque do usuário; criar aqui,
      // e não na montagem, é o que faz o som valer no celular.
      audioRef.current ??= new AudioContext();
      const ctx = audioRef.current;
      if (ctx.state === 'suspended') void ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.value = longo ? 660 : 880;
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (longo ? 0.9 : 0.25));

      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (longo ? 0.9 : 0.25));
    } catch {
      // Sem áudio o cronômetro continua servindo; o número na tela é o que vale.
    }
  }, []);

  // Tique de um segundo. A troca de fase acontece aqui dentro para o apito
  // sair no mesmo instante em que o número vira.
  useEffect(() => {
    if (fase === 'parado') return;

    const timer = window.setInterval(() => {
      setRestante((atual) => {
        if (atual > 1) return atual - 1;

        if (fase === 'round') {
          apitar(true);
          setFase('descanso');
          return preset.rest;
        }

        apitar(false);
        setRound((n) => n + 1);
        setFase('round');
        return preset.round;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [fase, preset, apitar]);

  const comecar = () => {
    apitar(false);
    setFase('round');
    setRestante(preset.round);
  };

  const zerar = () => {
    setFase('parado');
    setRound(1);
    setRestante(preset.round);
  };

  const minutos = Math.floor(restante / 60);
  const segundos = restante % 60;

  return (
    <section
      className={cn(
        'rounded-2xl border p-5 transition-colors',
        fase === 'round'
          ? 'border-crimson/50 bg-crimson/[.1]'
          : fase === 'descanso'
            ? 'border-emerald-500/40 bg-emerald-500/[.08]'
            : 'border-hairline bg-white/[.04]',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="panel-title">Cronômetro</h2>
        <span className="text-xs text-muted">
          {fase === 'parado' ? 'parado' : `Round ${round} · ${fase === 'round' ? 'treino' : 'descanso'}`}
        </span>
      </div>

      <p
        aria-live="off"
        className={cn(
          'mt-3 text-center font-display tabular-nums leading-none',
          'text-[clamp(3rem,18vw,5rem)]',
          fase === 'descanso' ? 'text-emerald-300' : 'text-foreground',
        )}
      >
        {minutos}:{String(segundos).padStart(2, '0')}
      </p>

      <div
        role="group"
        aria-label="Formato do round"
        className="mt-4 flex flex-wrap justify-center gap-2"
      >
        {PRESETS.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              setPreset(item);
              setFase('parado');
              setRound(1);
              setRestante(item.round);
            }}
            aria-pressed={preset.label === item.label}
            className={cn(
              'inline-flex min-h-[44px] items-center rounded-xl border px-3 text-sm transition-colors',
              preset.label === item.label
                ? 'border-white/25 bg-white/[.1] text-foreground'
                : 'border-hairline text-muted',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        {fase === 'parado' ? (
          <button type="button" onClick={comecar} className="btn-primary flex-1">
            Começar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setFase('parado')}
            className="btn-secondary flex-1"
          >
            Pausar
          </button>
        )}
        <button type="button" onClick={zerar} className="btn-ghost">
          Zerar
        </button>
      </div>

      <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
        Funciona sem internet depois que a página abriu. Minutos de treino × descanso.
      </p>
    </section>
  );
}
