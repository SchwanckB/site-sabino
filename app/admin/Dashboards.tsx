'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Stat, StatStrip } from '@/components/app/PageHeader';
import { cn, pluralize } from '@/lib/utils';
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
      {/*
        Recortes como controle segmentado, não como pílulas soltas: um bloco
        com divisórias internas ocupa menos espaço, deixa claro que as opções
        são excludentes e é o que um painel de gestão usa.
      */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented
          label="Filtrar por categoria"
          options={RECORTES}
          value={recorte}
          onChange={setRecorte}
        />
        <Segmented label="Filtrar por sexo" options={SEXOS} value={sexo} onChange={setSexo} />

        <p aria-live="polite" className="text-xs text-muted">
          {filtrados.length} {pluralize(filtrados.length, 'aluno', 'alunos')}
        </p>
      </div>

      {/* Números ---------------------------------------------------------- */}
      <div className="mt-3">
        <StatStrip>
          <Stat
            label="Alunos ativos"
            value={String(filtrados.length)}
            hint={`${filtrados.filter((r) => r.category === 'kids').length} crianças · ${filtrados.filter((r) => r.category === 'adulto').length} adultos`}
          />
          <Stat
            label="Em dia"
            value={`${percentualEmDia}%`}
            hint={`${emDia} de ${filtrados.length}`}
            tone={percentualEmDia >= 80 ? 'bom' : 'neutro'}
          />
          <Stat
            label="Inadimplentes"
            value={String(vencidas.length)}
            hint={totalAberto > 0 ? `${formatCents(totalAberto)} em aberto` : 'nada em aberto'}
            tone={vencidas.length > 0 ? 'alerta' : 'bom'}
          />
          <Stat
            label="Treinos / 30d"
            value={String(treinosNoMes)}
            hint={`média ${mediaTreinos.toFixed(1)} por aluno`}
          />
        </StatStrip>
      </div>

      {emBreve.length > 0 || semPlano.length > 0 ? (
        <p className="mt-2.5 text-xs text-muted">
          {emBreve.length > 0 ? (
            <Link href="/admin/financeiro" className="text-amber-300 hover:underline">
              {emBreve.length} vence{emBreve.length === 1 ? '' : 'm'} nos próximos dias
            </Link>
          ) : null}
          {emBreve.length > 0 && semPlano.length > 0 ? ' · ' : ''}
          {semPlano.length > 0 ? (
            <Link href="/admin/financeiro" className="text-crimson hover:underline">
              {semPlano.length} sem mensalidade definida
            </Link>
          ) : null}
        </p>
      ) : null}

      {/* Frequência -------------------------------------------------------- */}
      <div className="mt-3 grid items-start gap-3 lg:grid-cols-2">
        <section className="panel panel-pad min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="panel-title">Quem mais treina</h3>
            <span className="text-[11px] text-muted">30 dias</span>
          </div>

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

        <section className="panel panel-pad min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="panel-title">Sumidos do tatame</h3>
            <span className="text-[11px] text-muted">{DIAS_SUMIDO}+ dias</span>
          </div>

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

/**
 * Controle segmentado.
 *
 * Um bloco só, com divisórias internas, em vez de botões soltos com `gap`.
 * Ocupa menos largura, comunica que as opções são excludentes e não compete
 * em peso visual com os botões de ação de verdade da tela.
 */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly { id: T; label: string }[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-lg border border-white/[.09] bg-white/[.025]"
    >
      {options.map((item, index) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          aria-pressed={value === item.id}
          className={cn(
            // 44px: compactar o controle nao pode custar o alvo de toque.
            'min-h-[44px] px-3.5 text-[13px] font-medium transition-colors',
            index > 0 && 'border-l border-white/[.09]',
            value === item.id
              ? 'bg-crimson text-foreground'
              : 'text-muted hover:bg-white/[.05] hover:text-foreground',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
