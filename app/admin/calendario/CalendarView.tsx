'use client';

import { useMemo, useState } from 'react';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { cn } from '@/lib/utils';
import {
  MONTH_NAMES,
  WEEKDAY_SHORT,
  buildMonth,
  shiftMonth,
  type CalendarItemKind,
  type DatedEvent,
  type PredictedGraduation,
  type RecurringClass,
} from '@/utils/calendarMonth';
import { formatBr } from '@/utils/datetime';
import { listBirthdays, type PersonLike } from '@/utils/roster';

import { deleteEventAction, saveEventAction } from '../actions';

/** Cores por tipo — a mesma leitura no ponto do celular e no rótulo do desktop. */
const KIND_STYLE: Readonly<Record<CalendarItemKind, { dot: string; chip: string; label: string }>> = {
  aula: { dot: 'bg-sky-400', chip: 'border-sky-400/40 bg-sky-400/10 text-sky-200', label: 'Aula' },
  graduacao: { dot: 'bg-crimson', chip: 'border-crimson/40 bg-crimson/10 text-crimson', label: 'Graduação' },
  evento: { dot: 'bg-emerald-400', chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200', label: 'Evento' },
  feriado: { dot: 'bg-amber-400', chip: 'border-amber-400/40 bg-amber-400/10 text-amber-200', label: 'Feriado' },
  aviso: { dot: 'bg-violet-400', chip: 'border-violet-400/40 bg-violet-400/10 text-violet-200', label: 'Aviso' },
  aniversario: { dot: 'bg-pink-400', chip: 'border-pink-400/40 bg-pink-400/10 text-pink-200', label: 'Aniversário' },
};

type Filter = 'tudo' | CalendarItemKind;

const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: 'tudo', label: 'Tudo' },
  { id: 'aula', label: 'Aulas' },
  { id: 'graduacao', label: 'Graduações' },
  { id: 'evento', label: 'Eventos' },
  { id: 'feriado', label: 'Feriados' },
  { id: 'aviso', label: 'Avisos' },
  { id: 'aniversario', label: 'Aniversários' },
];

const inputClass =
  'w-full min-h-[44px] rounded-xl border border-hairline bg-white/[.04] px-3 py-2 text-sm text-foreground focus:border-crimson focus:outline-none';

/**
 * Calendário do mês.
 *
 * No celular a célula mostra só o número e pontos coloridos — rótulo de texto
 * em sete colunas de 45px vira ilegível. O detalhe do dia aparece no painel
 * abaixo, que é onde a leitura realmente acontece em tela pequena.
 */
export function CalendarView({
  classes,
  events,
  graduations,
  people,
  today,
  initialYear,
  initialMonth,
}: {
  readonly classes: readonly RecurringClass[];
  readonly events: readonly DatedEvent[];
  readonly graduations: readonly PredictedGraduation[];
  /** Alunos ativos — os aniversários são derivados do mês exibido. */
  readonly people: readonly PersonLike[];
  /** `YYYY-MM-DD` de hoje em São Paulo, calculado no servidor. */
  readonly today: string;
  readonly initialYear: number;
  readonly initialMonth: number;
}) {
  const [cursor, setCursor] = useState({ year: initialYear, month: initialMonth });
  const [filter, setFilter] = useState<Filter>('tudo');
  const [classId, setClassId] = useState<string>('todas');
  const [selected, setSelected] = useState<string>(today);
  const [creating, setCreating] = useState(false);

  // `buildMonth` recebe `now` por parâmetro; aqui ele vem do servidor para que
  // "hoje" não dependa do relógio do aparelho.
  const agora = useMemo(() => new Date(`${today}T12:00:00-03:00`), [today]);

  // Aniversários mudam com o mês navegado; derivar aqui evita mandar doze
  // listas prontas do servidor só porque o professor pode virar a página.
  const birthdays = useMemo(
    () =>
      listBirthdays(people, cursor.year, cursor.month, agora).map((b) => ({
        id: b.id,
        date: b.date,
        name: b.name,
        turning: b.turning,
      })),
    [people, cursor, agora],
  );

  const dias = useMemo(
    () =>
      buildMonth(
        cursor.year,
        cursor.month,
        { classes, events, graduations, birthdays },
        agora,
      ),
    [cursor, classes, events, graduations, birthdays, agora],
  );

  const passaFiltro = useMemo(
    () => (kind: CalendarItemKind, itemClassId: string | null) => {
      if (filter !== 'tudo' && kind !== filter) return false;
      if (classId !== 'todas' && kind === 'aula' && itemClassId !== classId) return false;
      // Com turma específica escolhida, só aulas interessam.
      if (classId !== 'todas' && kind !== 'aula') return false;
      return true;
    },
    [filter, classId],
  );

  const diasFiltrados = useMemo(
    () => dias.map((dia) => ({ ...dia, items: dia.items.filter((i) => passaFiltro(i.kind, i.classId)) })),
    [dias, passaFiltro],
  );

  const diaSelecionado = diasFiltrados.find((d) => d.date === selected) ?? null;
  const turmas = useMemo(
    () => [...new Map(classes.map((c) => [c.id, c])).values()],
    [classes],
  );

  const eventosDoDia = events.filter((e) => e.date === selected);

  return (
    <div>
      {/* Navegação do mês ------------------------------------------------ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCursor((c) => shiftMonth(c.year, c.month, -1))}
            aria-label="Mês anterior"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-hairline bg-white/[.04] text-foreground hover:border-white/20"
          >
            ‹
          </button>
          <h2 className="min-w-[10rem] text-center font-display text-xl uppercase tracking-tight sm:text-2xl">
            {MONTH_NAMES[cursor.month - 1]} {cursor.year}
          </h2>
          <button
            type="button"
            onClick={() => setCursor((c) => shiftMonth(c.year, c.month, 1))}
            aria-label="Próximo mês"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-hairline bg-white/[.04] text-foreground hover:border-white/20"
          >
            ›
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
              setSelected(today);
            }}
            className="btn-secondary text-xs"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setCreating((open) => !open)}
            className="btn-primary text-xs"
          >
            {creating ? 'Fechar' : 'Marcar evento'}
          </button>
        </div>
      </div>

      {/* Novo evento ------------------------------------------------------ */}
      {creating ? (
        <ActionForm
          action={saveEventAction}
          className="surface-card mt-4 p-4 sm:p-5"
          onDone={(r) => {
            if (r.ok) setCreating(false);
          }}
        >
          <h3 className="text-base normal-case tracking-normal">Novo evento</h3>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="ev-title" className="block text-xs text-muted">Nome</label>
              <input id="ev-title" name="title" type="text" required placeholder="Confraternização" className={cn(inputClass, 'mt-1')} />
            </div>
            <div>
              <label htmlFor="ev-date" className="block text-xs text-muted">Data</label>
              <input id="ev-date" name="date" type="date" required defaultValue={selected} className={cn(inputClass, 'mt-1')} />
            </div>
            <div>
              <label htmlFor="ev-time" className="block text-xs text-muted">Horário (opcional)</label>
              <input id="ev-time" name="time" type="time" className={cn(inputClass, 'mt-1')} />
            </div>
            <div>
              <label htmlFor="ev-kind" className="block text-xs text-muted">Tipo</label>
              <select id="ev-kind" name="kind" defaultValue="evento" className={cn(inputClass, 'mt-1')}>
                <option value="evento">Evento</option>
                <option value="feriado">Feriado</option>
                <option value="graduacao">Exame de faixa</option>
                <option value="aviso">Aviso</option>
              </select>
            </div>
          </div>

          <div className="mt-3">
            <label htmlFor="ev-note" className="block text-xs text-muted">Observação (opcional)</label>
            <input id="ev-note" name="note" type="text" className={cn(inputClass, 'mt-1')} />
          </div>

          <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" name="closesAcademy" className="mt-0.5 h-5 w-5 accent-crimson" />
            <span className="text-foreground">
              A academia não abre neste dia
              <span className="block text-xs text-muted">As aulas somem do calendário nessa data.</span>
            </span>
          </label>

          <SubmitButton className="btn-primary mt-4">Salvar evento</SubmitButton>
        </ActionForm>
      ) : null}

      {/* Filtros ---------------------------------------------------------- */}
      <div className="mt-5 space-y-3">
        <div role="group" aria-label="Filtrar o calendário" className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setFilter(item.id);
                if (item.id !== 'aula' && item.id !== 'tudo') setClassId('todas');
              }}
              aria-pressed={filter === item.id}
              className={cn(
                'inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition-colors',
                filter === item.id
                  ? 'border-crimson bg-crimson text-foreground'
                  : 'border-hairline bg-white/[.04] text-muted hover:text-foreground',
              )}
            >
              {item.id !== 'tudo' ? (
                <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', KIND_STYLE[item.id].dot)} />
              ) : null}
              {item.label}
            </button>
          ))}
        </div>

        {turmas.length > 0 ? (
          <label className="flex flex-wrap items-center gap-2 text-xs text-muted">
            Turma específica
            <select
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              className="min-h-[44px] min-w-0 max-w-full rounded-xl border border-hairline bg-white/[.04] px-3 text-sm text-foreground focus:border-crimson focus:outline-none"
            >
              <option value="todas">Todas as turmas</option>
              {turmas.map((turma) => (
                <option key={turma.id} value={turma.id}>
                  {WEEKDAY_SHORT[turma.weekday]} {turma.startTime} · {turma.title} · {turma.level}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {/* Grade do mês ----------------------------------------------------- */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-hairline">
        <div className="grid grid-cols-7 border-b border-hairline bg-white/[.03]">
          {WEEKDAY_SHORT.map((dia) => (
            <div key={dia} className="px-1 py-2 text-center text-[10px] uppercase tracking-wider text-muted sm:text-xs">
              <span className="sm:hidden">{dia.charAt(0)}</span>
              <span className="hidden sm:inline">{dia}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {diasFiltrados.map((dia) => {
            const ativo = dia.date === selected;
            const tipos = [...new Set(dia.items.map((i) => i.kind))];

            return (
              <button
                key={dia.date}
                type="button"
                onClick={() => setSelected(dia.date)}
                aria-pressed={ativo}
                aria-label={`${dia.dayOfMonth} — ${dia.items.length} ${dia.items.length === 1 ? 'item' : 'itens'}`}
                className={cn(
                  'flex min-h-[64px] flex-col items-start gap-1 border-b border-r border-hairline p-1.5 text-left transition-colors sm:min-h-[104px] sm:p-2',
                  !dia.inMonth && 'opacity-35',
                  ativo ? 'bg-crimson/10 ring-1 ring-inset ring-crimson' : 'hover:bg-white/[.04]',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums',
                    dia.isToday ? 'bg-crimson font-semibold text-foreground' : 'text-muted',
                  )}
                >
                  {dia.dayOfMonth}
                </span>

                {/* Celular: pontos. Desktop: rótulos. */}
                <span className="flex flex-wrap gap-1 sm:hidden" aria-hidden="true">
                  {tipos.slice(0, 4).map((kind) => (
                    <span key={kind} className={cn('h-1.5 w-1.5 rounded-full', KIND_STYLE[kind].dot)} />
                  ))}
                </span>

                <span className="hidden w-full flex-col gap-0.5 sm:flex" aria-hidden="true">
                  {dia.items.slice(0, 3).map((item) => (
                    <span
                      key={item.id}
                      className={cn(
                        'truncate rounded border px-1 py-0.5 text-[10px] leading-tight',
                        KIND_STYLE[item.kind].chip,
                      )}
                    >
                      {item.time ? `${item.time} ` : ''}
                      {item.title}
                    </span>
                  ))}
                  {dia.items.length > 3 ? (
                    <span className="px-1 text-[10px] text-muted">+{dia.items.length - 3}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detalhe do dia --------------------------------------------------- */}
      <section className="surface-card mt-5 p-4 sm:p-5">
        <h3 className="text-base normal-case tracking-normal">
          {formatBr(selected)}
          <span className="ml-2 text-sm font-normal text-muted">
            {diaSelecionado?.items.length ?? 0}{' '}
            {(diaSelecionado?.items.length ?? 0) === 1 ? 'item' : 'itens'}
          </span>
        </h3>

        {!diaSelecionado || diaSelecionado.items.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Nada marcado neste dia para o filtro atual.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-hairline">
            {diaSelecionado.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
                <span aria-hidden="true" className={cn('h-2.5 w-2.5 shrink-0 rounded-full', KIND_STYLE[item.kind].dot)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">
                    {item.time ? <span className="font-display tabular-nums">{item.time} </span> : null}
                    {item.title}
                  </p>
                  {item.detail ? <p className="truncate text-xs text-muted">{item.detail}</p> : null}
                </div>
                <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px]', KIND_STYLE[item.kind].chip)}>
                  {KIND_STYLE[item.kind].label}
                </span>
              </li>
            ))}
          </ul>
        )}

        {eventosDoDia.length > 0 ? (
          <div className="mt-4 border-t border-hairline pt-4">
            <p className="text-xs text-muted">Eventos marcados neste dia</p>
            <ul className="mt-2 space-y-2">
              {eventosDoDia.map((evento) => (
                <li key={evento.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm text-foreground">{evento.title}</span>
                  <ActionForm action={deleteEventAction} confirm={`Remover "${evento.title}" do calendário?`}>
                    <input type="hidden" name="id" value={evento.id} />
                    <SubmitButton className="btn-ghost text-xs text-crimson" pendingLabel="…">
                      Remover
                    </SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
