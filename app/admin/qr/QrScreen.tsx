'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

interface QrState {
  readonly dataUrl: string;
}

export interface UnidadeOption {
  readonly id: string;
  readonly label: string;
  /** Linha de apoio do cartaz: cidade. */
  readonly sublabel: string;
  /** Quantas turmas a unidade tem na grade — só para orientar o professor. */
  readonly classCount: number;
}

/**
 * Cartaz de presença da academia.
 *
 * Uma folha por unidade, colada na parede. Era uma por turma, e isso
 * significava imprimir e repor uma folha para cada horário da grade — com
 * nove turmas numa unidade, nove cartazes. Agora o aluno escaneia um só e
 * escolhe a aula no painel dele.
 *
 * O código não gira. O que impede o check-in de casa é a janela de horário
 * da aula, somada à matrícula na turma e à trava de uma presença por dia.
 */
export function QrScreen({ unidades }: { readonly unidades: readonly UnidadeOption[] }) {
  const [unit, setUnit] = useState<string>(unidades[0]?.id ?? '');
  const [qr, setQr] = useState<QrState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const academia = unidades.find((item) => item.id === unit) ?? null;

  const load = useCallback(async () => {
    if (unit.length === 0) {
      setError('Nenhuma academia cadastrada.');
      return;
    }

    setQr(null);
    try {
      const response = await fetch(`/api/admin/qr?unit=${encodeURIComponent(unit)}`, {
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
  }, [unit]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      {/* Seleção e ação: some na impressão. */}
      <div className="print:hidden">
        {unidades.length > 0 ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 sm:max-w-sm">
              <span className="block text-xs text-muted">Academia deste cartaz</span>
              <select
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-hairline bg-white/[.04] px-3 text-sm text-foreground focus:border-crimson focus:outline-none"
              >
                {unidades.map((item) => (
                  <option key={item.id} value={item.id}>
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
          Uma folha por academia, colada na parede. O código não muda, então o cartaz vale para
          sempre. Depois de escanear, o aluno escolhe no painel dele qual aula está treinando —
          entre as turmas dele que estão acontecendo naquele horário.
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
            {academia ? (
              <>
                <p className="mt-1 font-display text-xl uppercase tracking-tight text-[#B3122A] sm:text-2xl">
                  {academia.label}
                </p>
                <p className="mt-0.5 text-sm text-black/60">{academia.sublabel}</p>
              </>
            ) : null}

            <div className="mt-5">
              {qr ? (
                <Image
                  src={qr.dataUrl}
                  alt="QR Code de presença da academia"
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
              Depois de escanear, escolha a sua aula. A presença vale no horário do treino, e
              os pais podem usar o próprio aparelho para o check-in da criança.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
