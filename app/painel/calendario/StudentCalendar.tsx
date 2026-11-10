'use client';

import { useMemo, useState } from 'react';

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

/**
 * Calendário do aluno — só leitura.
 *
 * É o gêmeo de `app/admin/calendario/CalendarView`, sem os formulários de
 * criar e apagar evento. Não reaproveita aquele componente de propósito: ele
 * importa as server actions do admin, e um aluno baixando esse bundle teria o
 * ID das actions de gravação do painel à mão. Separar é mais barato que
 * confiar numa prop para esconder metade da tela.
 *
 * O que entra aqui é o recorte do aluno, montado no servidor: as turmas em que
 * ele está matriculado, as aulas dele canceladas ou remarcadas, os eventos da
 * academia e a própria graduação prevista. Aniversário de colega fica de fora
 * — data de nascimento é dado pessoal, e boa parte da base é de menores.
 */

const KIND_STYLE: Readonly<Record<CalendarItemKind, { dot: string; chip: string; label: string }>> = {
  aula: { dot: 'bg-sky-400', chip: 'border-sky-400/40 bg-sky-400/10 text-sky-200', label: 'Aula' },
  graduacao: {
    dot: 'bg-crimson',
    chip: 'border-crimson/40 bg-crimson/10 text-accent',
    label: 'Graduação',
  },
  evento: {
    dot: 'bg-emerald-400',
    chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
    label: 'Evento',
  },
  feriado: {
    dot: 'bg-amber-400',
    chip: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
    label: 'Feriado',
  },
  aviso: {
    dot: 'bg-violet-400',
    chip: 'border-violet-400/40 bg-violet-400/10 text-violet-200',
    label: 'Aviso',
  },
  aniversario: {
    dot: 'bg-pink-400',
    chip: 'border-pink-400/40 bg-pink-400/10 text-pink-200',
    label: 'Aniversário',
  },
};

export function StudentCalendar({
  classes,
  events,
  graduations,
  canceledDates,
  today,
  initialYear,
  initialMonth,
}: {
  /** Só as turmas em que o aluno está matriculado. */
  readonly classes: readonly RecurringClass[];
  readonly events: readonly DatedEvent[];
  /** A graduação prevista dele, quando houver. */
  readonly graduations: readonly PredictedGraduation[];
  /**
   * Datas em que uma turma dele foi cancelada, por data.
   *
   * O motor do calendário não conhece cancelamento: ele projeta a turma no dia
   * da semana. Sem esta marca, o aluno abriria o mês e veria a aula de um dia
   * em que o professor avisou que não teria treino.
   */
  readonly canceledDates: Readonly<Record<string, readonly string[]>>;
  /** `YYYY-MM-DD` de hoje em São Paulo, calculado no servidor. */
  readonly today: string;
  readonly initialYear: number;
  readonly initialMonth: number;
}) {
  const [cursor, setCursor] = useState({ year: initialYear, month: initialMonth });
  const [selected, setSelected] = useState<string>(today);

  // `buildMonth` recebe `now` por parâmetro; aqui ele vem do servidor para que
  // "hoje" não dependa do relógio do aparelho do aluno.
  const agora = useMemo(() => new Date(`${today}T12:00:00-03:00`), [today]);

  const dias = useMemo(
    () => buildMonth(cursor.year, cursor.month, { classes, events, graduations }, agora),
    [cursor, classes, events, graduations, agora],
  );

  const diaSelecionado = dias.find((dia) => dia.date === selected) ?? null;

  const cancelado = (date: string, classId: string | null): boolean =>
    classId !== null && (canceledDates[date] ?? []).includes(classId);

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
      </div>

      {/* Grade do mês ----------------------------------------------------- */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-hairline">
        <div className="grid grid-cols-7 border-b border-hairline bg-white/[.03]">
          {WEEKDAY_SHORT.map((dia) => (
            <div
              key={dia}
              className="px-1 py-2 text-center text-[10px] uppercase tracking-wider text-muted sm:text-xs"
            >
              <span className="sm:hidden">{dia.charAt(0)}</span>
              <span className="hidden sm:inline">{dia}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {dias.map((dia) => {
            const ativo = dia.date === selected;
            const tipos = [...new Set(dia.items.map((item) => item.kind))];

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
                    <span
                      key={kind}
                      className={cn('h-1.5 w-1.5 rounded-full', KIND_STYLE[kind].dot)}
                    />
                  ))}
                </span>

                <span className="hidden w-full flex-col gap-0.5 sm:flex" aria-hidden="true">
                  {dia.items.slice(0, 3).map((item) => (
                    <span
                      key={item.id}
                      className={cn(
                        'truncate rounded border px-1 py-0.5 text-[10px] leading-tight',
                        KIND_STYLE[item.kind].chip,
                        cancelado(dia.date, item.classId) && 'line-through opacity-60',
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
      <section className="panel mt-5 p-4 sm:p-5">
        <h3 className="text-base normal-case tracking-normal">
          {formatBr(selected)}
          <span className="ml-2 text-sm font-normal text-muted">
            {diaSelecionado?.items.length ?? 0}{' '}
            {(diaSelecionado?.items.length ?? 0) === 1 ? 'item' : 'itens'}
          </span>
        </h3>

        {!diaSelecionado || diaSelecionado.items.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nada marcado para você neste dia.</p>
        ) : (
          <ul className="mt-3 divide-y divide-hairline">
            {diaSelecionado.items.map((item) => {
              const foiCancelada = cancelado(diaSelecionado.date, item.classId);

              return (
                <li key={item.id} className="flex items-baseline gap-3 py-2.5">
                  <span
                    aria-hidden="true"
                    className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', KIND_STYLE[item.kind].dot)}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-sm text-foreground',
                        foiCancelada && 'line-through opacity-60',
                      )}
                    >
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {KIND_STYLE[item.kind].label}
                      {item.time ? ` · ${item.time}` : ''}
                      {item.detail ? ` · ${item.detail}` : ''}
                    </p>
                    {foiCancelada ? (
                      <p className="mt-1 text-xs text-accent">
                        Esta aula foi cancelada neste dia.
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Legenda ----------------------------------------------------------- */}
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
        {(['aula', 'evento', 'graduacao', 'feriado', 'aviso'] as const).map((kind) => (
          <li key={kind} className="flex items-center gap-1.5 text-xs text-muted">
            <span
              aria-hidden="true"
              className={cn('h-2 w-2 rounded-full', KIND_STYLE[kind].dot)}
            />
            {KIND_STYLE[kind].label}
          </li>
        ))}
      </ul>
    </div>
  );
}
