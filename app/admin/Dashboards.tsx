'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { cn, pluralize } from '@/lib/utils';
import { formatBr } from '@/utils/datetime';
import { formatCents, type PaymentStatus } from '@/utils/paymentEngine';

export interface DashboardRow {
  readonly id: string;
  readonly name: string;
  readonly category: 'kids' | 'adulto';
  readonly gender: 'masculino' | 'feminino' | 'nao_informado';
  readonly belt: string;
  /** `null` quando o aluno ainda não tem mensalidade definida. */
  readonly paymentStatus: PaymentStatus | null;
  readonly openCents: number;
  readonly dueDate: string;
  readonly checkins30: number;
  readonly checkinsTotal: number;
  readonly lastCheckinAt: string | null;
  readonly daysSinceLastCheckin: number | null;
}

type Recorte = 'todos' | 'kids' | 'adulto';
type Sexo = 'todos' | 'masculino' | 'feminino';

const RECORTES: readonly { id: Recorte; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'kids', label: 'Crianças' },
  { id: 'adulto', label: 'Adultos' },
];

const SEXOS: readonly { id: Sexo; label: string }[] = [
  { id: 'todos', label: 'Ambos' },
  { id: 'masculino', label: 'Masculino' },
  { id: 'feminino', label: 'Feminino' },
];

/** Quantos dias sem treinar já merecem um telefonema. */
const DIAS_SUMIDO = 21;

function Tile({
  label,
  value,
  hint,
  tone = 'neutro',
  href,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly tone?: 'neutro' | 'alerta' | 'bom';
  readonly href?: string;
}) {
  const body = (
    <>
      <p className="text-xs text-muted">{label}</p>
      <p
        className={cn(
          'mt-1 font-display text-3xl leading-none tabular-nums',
          tone === 'alerta' ? 'text-crimson' : tone === 'bom' ? 'text-emerald-300' : 'text-foreground',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs leading-snug text-muted">{hint}</p> : null}
    </>
  );

  const classes = cn(
    'block rounded-2xl border p-4 backdrop-blur-md transition-colors',
    tone === 'alerta'
      ? 'border-crimson/40 bg-crimson/[.07]'
      : 'border-hairline bg-white/[.04]',
    href && 'hover:border-white/25',
  );

  return href ? (
    <Link href={href} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

/**
 * Painéis da visão geral.
 *
 * O recorte (crianças/adultos, masculino/feminino) é aplicado a tudo de uma
 * vez — números, inadimplência e frequência — porque a pergunta real do
 * professor é sempre sobre um grupo ("como está a turma infantil?"), não sobre
 * um indicador isolado.
 */
export function Dashboards({ rows }: { readonly rows: readonly DashboardRow[] }) {
  const [recorte, setRecorte] = useState<Recorte>('todos');
  const [sexo, setSexo] = useState<Sexo>('todos');

  const filtrados = useMemo(
    () =>
      rows.filter((row) => {
        if (recorte !== 'todos' && row.category !== recorte) return false;
        if (sexo !== 'todos' && row.gender !== sexo) return false;
        return true;
      }),
    [rows, recorte, sexo],
  );

  const vencidas = filtrados.filter((r) => r.paymentStatus === 'vencida');
  const emBreve = filtrados.filter((r) => r.paymentStatus === 'vence_em_breve');
  const semPlano = filtrados.filter((r) => r.paymentStatus === null);
  const totalAberto = vencidas.reduce((soma, r) => soma + r.openCents, 0);

  const emDia = filtrados.length - vencidas.length - semPlano.length;
  const percentualEmDia =
    filtrados.length === 0 ? 0 : Math.round((emDia / filtrados.length) * 100);

  const maisPresentes = [...filtrados]
    .filter((r) => r.checkins30 > 0)
    .sort((a, b) => b.checkins30 - a.checkins30)
    .slice(0, 5);

  const sumidos = [...filtrados]
    .filter((r) => r.daysSinceLastCheckin === null || r.daysSinceLastCheckin >= DIAS_SUMIDO)
    .sort((a, b) => (b.daysSinceLastCheckin ?? 9999) - (a.daysSinceLastCheckin ?? 9999))
    .slice(0, 8);

  const treinosNoMes = filtrados.reduce((soma, r) => soma + r.checkins30, 0);
  const mediaTreinos = filtrados.length === 0 ? 0 : treinosNoMes / filtrados.length;

  return (
    <div>
      {/* Recortes --------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div role="group" aria-label="Filtrar por categoria" className="flex flex-wrap gap-2">
          {RECORTES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRecorte(item.id)}
              aria-pressed={recorte === item.id}
              className={cn(
                'inline-flex min-h-[44px] items-center rounded-xl border px-4 text-sm font-medium transition-colors',
                recorte === item.id
                  ? 'border-crimson bg-crimson text-foreground'
                  : 'border-hairline bg-white/[.04] text-muted hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div role="group" aria-label="Filtrar por sexo" className="flex flex-wrap gap-2">
          {SEXOS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSexo(item.id)}
              aria-pressed={sexo === item.id}
              className={cn(
                'inline-flex min-h-[44px] items-center rounded-xl border px-3.5 text-sm transition-colors',
                sexo === item.id
                  ? 'border-white/25 bg-white/[.08] text-foreground'
                  : 'border-hairline bg-white/[.04] text-muted hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <p aria-live="polite" className="mt-4 text-sm text-muted">
        {filtrados.length} {pluralize(filtrados.length, 'aluno ativo', 'alunos ativos')} no recorte
      </p>

      {/* Números ---------------------------------------------------------- */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Alunos ativos"
          value={String(filtrados.length)}
          hint={`${filtrados.filter((r) => r.category === 'kids').length} crianças · ${filtrados.filter((r) => r.category === 'adulto').length} adultos`}
          href="/admin/alunos"
        />
        <Tile
          label="Mensalidades em dia"
          value={`${percentualEmDia}%`}
          hint={`${emDia} de ${filtrados.length}`}
          tone={percentualEmDia >= 80 ? 'bom' : 'neutro'}
          href="/admin/financeiro"
        />
        <Tile
          label="Inadimplentes"
          value={String(vencidas.length)}
          hint={totalAberto > 0 ? `${formatCents(totalAberto)} em aberto` : 'nada em aberto'}
          tone={vencidas.length > 0 ? 'alerta' : 'bom'}
          href="/admin/financeiro"
        />
        <Tile
          label="Treinos em 30 dias"
          value={String(treinosNoMes)}
          hint={`média de ${mediaTreinos.toFixed(1)} por aluno`}
          href="/admin/presenca"
        />
      </div>

      {(emBreve.length > 0 || semPlano.length > 0) ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {emBreve.length > 0 ? (
            <Tile
              label="Vencem nos próximos dias"
              value={String(emBreve.length)}
              hint={`próximo: ${formatBr(emBreve.map((r) => r.dueDate).sort()[0] ?? null)}`}
              href="/admin/financeiro"
            />
          ) : null}
          {semPlano.length > 0 ? (
            <Tile
              label="Sem mensalidade definida"
              value={String(semPlano.length)}
              hint="defina o valor para entrar na cobrança"
              tone="alerta"
              href="/admin/financeiro"
            />
          ) : null}
        </div>
      ) : null}

      {/* Frequência -------------------------------------------------------- */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="surface-card min-w-0 p-5">
          <h3 className="text-base normal-case tracking-normal">Quem mais treina</h3>
          <p className="mt-1 text-xs text-muted">Últimos 30 dias, no recorte atual.</p>

          {maisPresentes.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Nenhum treino registrado neste período.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {maisPresentes.map((row, index) => {
                const topo = maisPresentes[0]?.checkins30 ?? 1;
                return (
                  <li key={row.id}>
                    {/*
                      A linha inteira é o link, com 44px de altura. Antes só o
                      nome era clicável: 20px de altura, impossível de acertar
                      com o dedo no celular.
                    */}
                    <Link
                      href={`/admin/alunos/${row.id}`}
                      className="group flex min-h-[44px] items-center gap-3 rounded-lg px-1 py-1 -mx-1 transition-colors hover:bg-white/[.04]"
                    >
                      <span className="w-4 shrink-0 font-display text-sm tabular-nums text-muted">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate text-sm text-foreground group-hover:text-crimson">
                            {row.name}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted">
                            {row.checkins30}
                          </span>
                        </span>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/[.07]">
                          <span
                            className="block h-full rounded-full bg-crimson"
                            style={{ width: `${Math.max(6, (row.checkins30 / topo) * 100)}%` }}
                          />
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="surface-card min-w-0 p-5">
          <h3 className="text-base normal-case tracking-normal">Sumidos do tatame</h3>
          <p className="mt-1 text-xs text-muted">
            Sem treinar há {DIAS_SUMIDO} dias ou mais — vale um contato antes de virar evasão.
          </p>

          {sumidos.length === 0 ? (
            <p className="mt-4 text-sm text-emerald-300">Ninguém sumido no recorte. Bom sinal.</p>
          ) : (
            <ul className="mt-4 divide-y divide-hairline">
              {sumidos.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/admin/alunos/${row.id}`}
                    className="group flex min-h-[44px] items-center justify-between gap-3 py-2.5 text-sm"
                  >
                    <span className="min-w-0 truncate text-foreground group-hover:text-crimson">
                      {row.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {row.daysSinceLastCheckin === null
                        ? 'nunca treinou'
                        : `há ${row.daysSinceLastCheckin} dias`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
