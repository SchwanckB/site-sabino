'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

interface QrState {
  readonly dataUrl: string;
}

export interface TurmaOption {
  readonly id: string;
  readonly label: string;
  /** Linha do cartaz: dia, horário e nível. */
  readonly sublabel: string;
  /** `true` quando a aula está acontecendo agora. */
  readonly openNow: boolean;
}

/**
 * Cartaz de presença da turma.
 *
 * O código é fixo: a academia imprime uma folha por turma e cola na parede.
 * Antes o QR girava a cada dois minutos, o que obrigava a manter uma tela
 * ligada na recepção durante todo o treino — e quando ninguém ligava, o
 * check-in simplesmente não acontecia.
 *
 * O que impede o aluno de bater presença de casa deixou de ser a rotação e
 * passou a ser a janela de horário da aula, somada à matrícula na turma e à
 * trava de uma presença por dia.
 */
export function QrScreen({ turmas }: { readonly turmas: readonly TurmaOption[] }) {
  const [classId, setClassId] = useState<string>(
    turmas.find((t) => t.openNow)?.id ?? turmas[0]?.id ?? '',
  );
  const [qr, setQr] = useState<QrState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const turma = turmas.find((item) => item.id === classId) ?? null;

  const load = useCallback(async () => {
    if (classId.length === 0) {
      setError('Nenhuma turma cadastrada nesta academia.');
      return;
    }

    setQr(null);
    try {
      const response = await fetch(`/api/admin/qr?classId=${encodeURIComponent(classId)}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        setError(
          body && typeof body === 'object' && 'error' in body
            ? String((body as { error: unknown }).error)
            : 'Não foi possível gerar o código.',
        );
        return;
      }

      setQr((await response.json()) as QrState);
      setError(null);
    } catch {
      setError('Sem conexão com o servidor.');
    }
  }, [classId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      {/* Seleção e ação: some na impressão. */}
      <div className="print:hidden">
        {turmas.length > 0 ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 sm:max-w-sm">
              <span className="block text-xs text-muted">Turma deste cartaz</span>
              <select
                value={classId}
                onChange={(event) => setClassId(event.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-hairline bg-white/[.04] px-3 text-sm text-foreground focus:border-crimson focus:outline-none"
              >
                {turmas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.openNow ? '• ' : ''}
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => window.print()}
              disabled={qr === null}
              className="btn-primary"
            >
              Imprimir cartaz
            </button>
          </div>
        ) : null}

        <p className="mt-3 max-w-2xl text-xs leading-relaxed text-muted">
          Imprima uma folha por turma e cole na parede. O código não muda, então o cartaz vale
          para sempre — a presença só é aceita no horário daquela aula e para quem está
          matriculado nela.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-6 max-w-md rounded-2xl border border-crimson/40 bg-crimson/[.08] px-5 py-8 text-center print:hidden"
        >
          <p className="font-display text-lg uppercase tracking-tight">Não foi possível gerar</p>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <button type="button" onClick={() => void load()} className="btn-secondary mt-5">
            Tentar novamente
          </button>
        </div>
      ) : (
        /*
          O cartaz. Fundo branco e texto preto mesmo no tema escuro: é o que
          vai sair na impressora, e um QR claro sobre fundo escuro não lê.
        */
        <section className="mt-6 overflow-hidden rounded-2xl bg-white text-black print:mt-0 print:rounded-none">
          <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-8 text-center">
            <p className="font-display text-2xl uppercase tracking-tight sm:text-3xl">
              Sabino Academia
            </p>
            {turma ? (
              <>
                <p className="mt-1 font-display text-xl uppercase tracking-tight text-[#B3122A] sm:text-2xl">
                  {turma.label}
                </p>
                <p className="mt-0.5 text-sm text-black/60">{turma.sublabel}</p>
              </>
            ) : null}

            <div className="mt-5">
              {qr ? (
                <Image
                  src={qr.dataUrl}
                  alt="QR Code de presença da turma"
                  width={900}
                  height={900}
                  unoptimized
                  priority
                  className={cn('h-auto w-[min(70vw,20rem)]', 'print:w-[13cm]')}
                />
              ) : (
                <div className="h-[min(70vw,20rem)] w-[min(70vw,20rem)] animate-pulse rounded-xl bg-black/10" />
              )}
            </div>

            <p className="mt-5 font-display text-xl uppercase tracking-tight sm:text-2xl">
              Aponte a câmera do celular
            </p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-black/60">
              A presença é registrada na hora, no horário desta aula. Pais podem usar o próprio
              aparelho para o check-in da criança.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
