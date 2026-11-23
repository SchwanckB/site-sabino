'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

interface QrState {
  readonly dataUrl: string;
  /** Endereço que o QR codifica — abre a tela de check-in. */
  readonly checkinUrl: string;
  /** Endereço da plaquinha NFC — grava a presença na abertura. */
  readonly nfcUrl: string;
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
 * O código não gira — é o que permite imprimir uma vez e gravar a plaquinha
 * NFC com o mesmo valor. O que impede o check-in de casa é a janela de
 * horário da aula, somada à trava de uma presença por aluno, dia e turma.
 */
export function QrScreen({
  unidades,
  siteUrlEstavel,
}: {
  readonly unidades: readonly UnidadeOption[];
  /**
   * `false` quando falta `NEXT_PUBLIC_SITE_URL`.
   *
   * Aí o endereço vem do deploy atual da Vercel e muda no deploy seguinte —
   * inofensivo num QR que se reimprime, fatal numa etiqueta já gravada e
   * colada na parede.
   */
  readonly siteUrlEstavel: boolean;
}) {
  const [unit, setUnit] = useState<string>(unidades[0]?.id ?? '');
  const [qr, setQr] = useState<QrState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

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

  /*
   * Buscar o código ao abrir e a cada troca de academia.
   *
   * A regra `set-state-in-effect` pega isto porque `load` mexe no estado antes
   * do primeiro await — limpa o QR anterior e avisa quando não há academia. O
   * aviso é derivável no render; o `setQr(null)` é reset de início de busca.
   * Separar os dois pede verificação em navegador, porque errar deixa a parede
   * sem cartaz.
   */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

      {/* Plaquinha NFC ---------------------------------------------------- */}
      {qr ? (
        <section className="panel panel-pad mt-6 print:hidden">
          <h2 className="panel-title">Plaquinha NFC</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Grave este endereço numa etiqueta NFC e cole no balcão. O aluno encosta o celular e
            a presença entra na hora — sem abrir o app, sem tocar em nada. É o mesmo código do
            cartaz, então as duas coisas funcionam ao mesmo tempo.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl border border-hairline bg-black/30 px-3 py-2.5 font-mono text-xs text-foreground">
              {qr.nfcUrl}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(qr.nfcUrl).then(() => {
                  setCopiado(true);
                  window.setTimeout(() => setCopiado(false), 2000);
                });
              }}
              className="btn-secondary shrink-0 text-sm"
            >
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>

          {/*
            O endereço do deploy numa etiqueta física é um erro que só aparece
            semanas depois: a plaquinha "para de funcionar" sem nada ter
            mudado na parede, porque o deploy seguinte mudou a URL.
          */}
          {!siteUrlEstavel ? (
            <p
              role="note"
              className="notice-warn mt-4 px-4 py-3 text-xs leading-relaxed text-amber-100"
            >
              <strong className="font-semibold">Não grave esta etiqueta ainda.</strong> Falta a
              variável <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SITE_URL</code> na
              Vercel, então o endereço acima é o deste deploy e muda no próximo. Numa etiqueta já
              colada na parede isso significa parar de funcionar sem motivo aparente.
            </p>
          ) : null}

          <details className="mt-4 border-t border-hairline pt-4">
            <summary className="min-h-[44px] cursor-pointer list-none text-sm text-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
              Como gravar a etiqueta
            </summary>

            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted">
              <li>
                Compre etiquetas NFC do tipo <strong className="text-foreground">NTAG213</strong>{' '}
                ou superior — as de adesivo, baratas, servem.
              </li>
              <li>
                No celular, instale um app de gravação (o{' '}
                <strong className="text-foreground">NFC Tools</strong> é o mais comum e é
                gratuito).
              </li>
              <li>
                Escolha <strong className="text-foreground">Escrever</strong> →{' '}
                <strong className="text-foreground">Adicionar registro</strong> →{' '}
                <strong className="text-foreground">URL / URI</strong> e cole o endereço acima.
              </li>
              <li>Encoste a etiqueta no celular para gravar.</li>
              <li>
                Depois de gravar, use a opção de{' '}
                <strong className="text-foreground">proteger contra escrita</strong>. Sem isso,
                qualquer pessoa com um celular regrava a plaquinha da recepção.
              </li>
            </ol>

            <p className="mt-3 text-xs leading-relaxed text-muted">
              Na primeira vez, o aluno vai precisar entrar na conta — e o login devolve ele
              direto para a presença, sem ter de encostar de novo. Depois disso o navegador
              guarda a sessão e os toques seguintes não pedem nada. No iPhone a plaquinha abre
              no Safari: quem usa o atalho na tela de início pode precisar entrar uma vez no
              Safari também, porque o iOS guarda as sessões separadas.
            </p>
          </details>
        </section>
      ) : null}
    </div>
  );
}
