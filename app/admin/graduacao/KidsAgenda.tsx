'use client';

import { useMemo, useState } from 'react';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { cn, pluralize } from '@/lib/utils';
import { GENDER_LABELS, type Gender } from '@/types/domain';
import { formatBr } from '@/utils/datetime';
import { KIDS_TOTAL_DEGREES, getDegreeColor, type StripeColor } from '@/utils/graduationEngine';

import { registerDegreeAction } from '../actions';

export interface AgendaRow {
  readonly id: string;
  readonly name: string;
  readonly age: number;
  readonly gender: Gender;
  readonly belt: string;
  readonly degree: number;
  readonly nextDegree: number | null;
  readonly nextDegreeColor: StripeColor | null;
  readonly status: 'ELEGIVEL' | 'AGUARDANDO' | 'PRONTO_PARA_AVALIACAO' | 'MIGRAR_PARA_ADULTO';
  readonly daysUntil: number;
  readonly daysSince: number;
  /** `YYYY-MM-DD` da próxima graduação prevista. */
  readonly eligibleAt: string;
  readonly lastGraduationAt: string;
}

const STRIPE_SWATCH: Readonly<Record<StripeColor, string>> = {
  branca: 'bg-stripe-branca',
  vermelha: 'bg-stripe-vermelha',
  amarela: 'bg-stripe-amarela',
};

type GenderFilter = 'todos' | 'masculino' | 'feminino';

const GENDER_FILTERS: readonly { id: GenderFilter; label: string }[] = [
  { id: 'todos', label: 'Todas as crianças' },
  { id: 'masculino', label: 'Meninos' },
  { id: 'feminino', label: 'Meninas' },
];

/** Barra dos 12 graus, cada marca na cor da própria tarja. */
function DegreeBar({ degree, next }: { readonly degree: number; readonly next: number | null }) {
  return (
    <div
      className="flex items-center gap-[2px]"
      role="img"
      aria-label={`Grau ${degree} de ${KIDS_TOTAL_DEGREES}`}
    >
      {Array.from({ length: KIDS_TOTAL_DEGREES }, (_, index) => index + 1).map((slot) => {
        const color = getDegreeColor(slot);
        return (
          <span
            key={slot}
            aria-hidden="true"
            className={cn(
              'h-4 flex-1 rounded-[2px]',
              slot <= degree && color ? STRIPE_SWATCH[color] : 'bg-white/[.07]',
              slot === next && 'ring-1 ring-inset ring-crimson',
            )}
          />
        );
      })}
    </div>
  );
}

/** "faltam 12 dias" / "hoje" / "há 4 dias". */
function quando(row: AgendaRow): string {
  if (row.status === 'ELEGIVEL') {
    return row.daysSince === 0
      ? 'liberado hoje'
      : `liberado há ${row.daysSince - 30} ${pluralize(row.daysSince - 30, 'dia', 'dias')}`;
  }
  if (row.daysUntil === 0) return 'hoje';
  if (row.daysUntil === 1) return 'amanhã';
  return `em ${row.daysUntil} dias`;
}

/**
 * Agenda de graduação infantil.
 *
 * Mostra não só quem já pode graduar, mas **quando cada criança gradua** — é o
 * que permite planejar a aula ("dia 19 fecham três graus") em vez de descobrir
 * no dia. Adulto não entra aqui porque não tem automação de grau.
 */
export function KidsAgenda({ rows }: { readonly rows: readonly AgendaRow[] }) {
  const [gender, setGender] = useState<GenderFilter>('todos');
  const [belt, setBelt] = useState<string>('todas');
  const [search, setSearch] = useState('');

  const belts = useMemo(
    () => [...new Set(rows.map((r) => r.belt))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [rows],
  );

  const visiveis = useMemo(() => {
    const termo = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (gender !== 'todos' && row.gender !== gender) return false;
      if (belt !== 'todas' && row.belt !== belt) return false;
      if (termo.length > 0 && !row.name.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [rows, gender, belt, search]);

  const elegiveis = visiveis.filter((r) => r.status === 'ELEGIVEL');
  const proximos = visiveis.filter((r) => r.status === 'AGUARDANDO');
  const parados = visiveis.filter(
    (r) => r.status === 'PRONTO_PARA_AVALIACAO' || r.status === 'MIGRAR_PARA_ADULTO',
  );

  // "Este mês" é o recorte que o professor usa para planejar a próxima aula.
  const em30dias = proximos.filter((r) => r.daysUntil <= 30);

  const card = (row: AgendaRow, destaque: boolean) => (
    <li
      key={row.id}
      className={cn(
        'rounded-2xl border p-4 backdrop-blur-md',
        destaque ? 'border-crimson/40 bg-crimson/[.06]' : 'border-hairline bg-white/[.04]',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
          <p className="text-xs text-muted">
            {row.age} {pluralize(row.age, 'ano', 'anos')} · <span className="capitalize">{row.belt}</span>
            {row.gender !== 'nao_informado' ? ` · ${GENDER_LABELS[row.gender]}` : ''}
          </p>
        </div>

        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
            destaque ? 'bg-crimson/20 text-crimson' : 'bg-white/10 text-muted',
          )}
        >
          {quando(row)}
        </span>
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between text-[11px] text-muted">
          <span>
            Grau {row.degree}/{KIDS_TOTAL_DEGREES}
          </span>
          {row.nextDegree !== null ? (
            <span>
              Próximo: {row.nextDegree}
              {row.nextDegreeColor ? ` · tarja ${row.nextDegreeColor}` : ''}
            </span>
          ) : null}
        </div>
        <div className="mt-1.5">
          <DegreeBar degree={row.degree} next={row.nextDegree} />
        </div>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/10 pt-3 text-[11px]">
        <div className="flex gap-1.5">
          <dt className="text-muted">Última:</dt>
          <dd className="tabular-nums text-foreground">{formatBr(row.lastGraduationAt)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted">Próxima:</dt>
          <dd className="tabular-nums text-foreground">{formatBr(row.eligibleAt)}</dd>
        </div>
      </dl>

      {row.status === 'ELEGIVEL' ? (
        <ActionForm
          action={registerDegreeAction}
          className="mt-3"
          confirm={`Registrar grau ${row.nextDegree} para ${row.name}?`}
        >
          <input type="hidden" name="studentId" value={row.id} />
          <SubmitButton className="btn-primary w-full text-xs" pendingLabel="Registrando…">
            Registrar grau {row.nextDegree}
          </SubmitButton>
        </ActionForm>
      ) : null}
    </li>
  );

  return (
    <div>
      {/* Resumo ------------------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface-card p-4">
          <p className="text-xs text-muted">Liberados agora</p>
          <p className="mt-1 font-display text-3xl leading-none tabular-nums text-crimson">
            {elegiveis.length}
          </p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs text-muted">Graduam em até 30 dias</p>
          <p className="mt-1 font-display text-3xl leading-none tabular-nums">{em30dias.length}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs text-muted">Crianças no filtro</p>
          <p className="mt-1 font-display text-3xl leading-none tabular-nums">{visiveis.length}</p>
        </div>
      </div>

      {/* Filtros ------------------------------------------------------ */}
      <div className="mt-5 space-y-3">
        <div role="group" aria-label="Filtrar por sexo" className="flex flex-wrap gap-2">
          {GENDER_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setGender(item.id)}
              aria-pressed={gender === item.id}
              className={cn(
                'inline-flex min-h-[44px] items-center rounded-xl border px-4 text-sm font-medium transition-colors',
                gender === item.id
                  ? 'border-crimson bg-crimson text-foreground'
                  : 'border-hairline bg-white/[.04] text-muted hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted">
            Faixa
            <select
              value={belt}
              onChange={(event) => setBelt(event.target.value)}
              className="min-h-[44px] rounded-xl border border-hairline bg-white/[.04] px-3 text-sm capitalize text-foreground focus:border-crimson focus:outline-none"
            >
              <option value="todas">Todas</option>
              {belts.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-0 flex-1">
            <span className="sr-only">Buscar criança</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome…"
              className="min-h-[44px] w-full rounded-xl border border-hairline bg-white/[.04] px-4 text-sm text-foreground placeholder:text-muted/70 focus:border-crimson focus:outline-none sm:max-w-xs"
            />
          </label>
        </div>
      </div>

      {/* Liberados agora --------------------------------------------- */}
      <section className="mt-8">
        <h3 className="text-base normal-case tracking-normal">
          Liberados para graduar
          <span aria-live="polite" className="ml-2 text-sm font-normal text-muted">
            {elegiveis.length}
          </span>
        </h3>

        {elegiveis.length === 0 ? (
          <p className="surface-card mt-3 px-5 py-8 text-center text-sm text-muted">
            Ninguém liberado neste filtro. A lista abaixo mostra quando cada um gradua.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {elegiveis.map((row) => card(row, true))}
          </ul>
        )}
      </section>

      {/* Próximas graduações ------------------------------------------ */}
      <section className="mt-8">
        <h3 className="text-base normal-case tracking-normal">Próximas graduações</h3>
        <p className="mt-1 text-xs text-muted">
          Cada criança gradua 30 dias depois da anterior. A data abaixo é a prevista.
        </p>

        {proximos.length === 0 ? (
          <p className="surface-card mt-3 px-5 py-8 text-center text-sm text-muted">
            Nenhuma graduação prevista neste filtro.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {proximos.map((row) => card(row, false))}
          </ul>
        )}
      </section>

      {/* Fora do fluxo ------------------------------------------------- */}
      {parados.length > 0 ? (
        <section className="mt-8">
          <h3 className="text-base normal-case tracking-normal">Precisam de decisão sua</h3>
          <ul className="mt-3 space-y-2">
            {parados.map((row) => (
              <li
                key={row.id}
                className="surface-card flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
                  <p className="text-xs text-muted">
                    {row.age} anos · <span className="capitalize">{row.belt}</span> · grau{' '}
                    {row.degree}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
                  {row.status === 'PRONTO_PARA_AVALIACAO'
                    ? 'Fechou os 12 graus — avaliar faixa'
                    : 'Fez 16 anos — migrar para adulto'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
