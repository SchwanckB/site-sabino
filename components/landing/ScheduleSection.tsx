'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useMemo, useState } from 'react';

import { Reveal, SectionHeading } from '@/components/ui/Reveal';
import {
  EXAMPLE_DATA_NOTICE,
  weekdayLabels,
  type ClassSlot,
  type ModalityId,
  type Schedule,
  type Weekday,
} from '@/data/seed';
import { whatsappLink, whatsappMessages } from '@/lib/site';
import { UNITS, UNIT_LABELS, type UnitId } from '@/types/domain';
import { cn } from '@/lib/utils';

const modalityAccent: Readonly<Record<ModalityId, string>> = {
  'jiu-jitsu': 'border-l-foreground/40',
  mma: 'border-l-crimson',
  kids: 'border-l-stripe-amarela',
};

const modalityLabel: Readonly<Record<ModalityId, string>> = {
  'jiu-jitsu': 'Jiu-Jitsu',
  mma: 'MMA',
  kids: 'Kids',
};

type Filter = ModalityId | 'todas';
type UnitFilter = UnitId | 'todas';

const filters: readonly { id: Filter; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'jiu-jitsu', label: 'Jiu-Jitsu' },
  { id: 'mma', label: 'MMA' },
  { id: 'kids', label: 'Kids e Infantil' },
];

export function ScheduleSection({ schedule }: { readonly schedule: Schedule }) {
  const [filter, setFilter] = useState<Filter>('todas');
  const reduceMotion = useReducedMotion();

  // A aba de academia só aparece quando há grade em mais de uma. Enquanto
  // a segunda escola não tiver horário cadastrado, a seção continua igual.
  const unidadesComAula = useMemo(
    () => UNITS.filter((unit) => schedule.classes.some((slot) => slot.unit === unit)),
    [schedule.classes],
  );
  const [unitFilter, setUnitFilter] = useState<UnitFilter>(
    unidadesComAula[0] ?? 'todas',
  );

  const days = useMemo(() => {
    const daUnidade =
      unitFilter === 'todas'
        ? schedule.classes
        : schedule.classes.filter((slot) => slot.unit === unitFilter);

    const visible =
      filter === 'todas'
        ? daUnidade
        : daUnidade.filter((slot) => slot.modality === filter);

    const byDay = new Map<Weekday, ClassSlot[]>();
    for (const slot of visible) {
      const bucket = byDay.get(slot.weekday);
      if (bucket) bucket.push(slot);
      else byDay.set(slot.weekday, [slot]);
    }

    return [...byDay.entries()]
      .sort(([a], [b]) => a - b)
      .map(([weekday, slots]) => ({
        weekday,
        slots: [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime)),
      }));
  }, [filter, unitFilter, schedule.classes]);

  return (
    <section
      id="horarios"
      aria-labelledby="horarios-titulo"
      className="py-20 sm:py-24 lg:py-32"
    >
      <div className="container-page">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            id="horarios-titulo"
            eyebrow="Grade da semana"
            title="Horários"
            description="Todas as turmas são de segunda a sexta, entre 18h30 e 21h30. Chegue 10 minutos antes na primeira aula para falar com o professor."
          />

          <Reveal delay={0.1} className="shrink-0 space-y-3">
            {unidadesComAula.length > 1 ? (
              <div
                role="group"
                aria-label="Escolher academia"
                className="flex flex-wrap gap-2"
              >
                {[...unidadesComAula, 'todas' as const].map((unit) => {
                  const active = unitFilter === unit;
                  return (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => setUnitFilter(unit)}
                      aria-pressed={active}
                      className={cn(
                        'inline-flex min-h-[44px] items-center rounded-xl border px-4 text-sm font-semibold transition-all duration-300 ease-organic',
                        active
                          ? 'border-white/25 bg-white/[.1] text-foreground'
                          : 'border-hairline bg-transparent text-muted hover:text-foreground',
                      )}
                    >
                      {unit === 'todas' ? 'As duas' : UNIT_LABELS[unit]}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div
              role="group"
              aria-label="Filtrar grade por modalidade"
              className="flex flex-wrap gap-2"
            >
              {filters.map((item) => {
                const active = filter === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFilter(item.id)}
                    aria-pressed={active}
                    className={cn(
                      'inline-flex min-h-[44px] items-center rounded-xl border px-4 text-sm font-medium transition-all duration-300 ease-organic',
                      active
                        ? 'border-crimson bg-crimson text-foreground'
                        : 'border-hairline bg-white/[.04] text-muted hover:border-white/20 hover:text-foreground',
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </Reveal>
        </div>

        {schedule.isExample ? (
          <Reveal className="mt-8">
            <p
              role="note"
              className="rounded-xl border border-dashed border-crimson/40 bg-crimson/[.06] px-4 py-3 text-xs leading-relaxed text-muted"
            >
              {EXAMPLE_DATA_NOTICE} A grade definitiva e publicada pelo painel do Admin.
            </p>
          </Reveal>
        ) : null}

        <div className="mt-10">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={filter}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: reduceMotion ? 0.15 : 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              {days.length === 0 ? (
                <p className="surface-card px-6 py-12 text-center text-sm text-muted">
                  Nenhuma turma desta modalidade na grade atual.
                </p>
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {days.map(({ weekday, slots }) => (
                    <li key={weekday} className="surface-card overflow-hidden">
                      <h3 className="border-b border-hairline px-5 py-4 text-sm tracking-[0.18em] text-muted">
                        {weekdayLabels[weekday]}
                      </h3>

                      <ul className="divide-y divide-hairline">
                        {slots.map((slot) => (
                          <li
                            key={slot.id}
                            className={cn(
                              'flex items-center gap-4 border-l-2 px-5 py-4',
                              modalityAccent[slot.modality],
                            )}
                          >
                            <time
                              className="shrink-0 font-display text-base tabular-nums text-foreground"
                              dateTime={slot.startTime}
                            >
                              {slot.startTime}
                            </time>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">
                                {slot.title}
                              </p>
                              <p className="truncate text-xs text-muted">
                                até {slot.endTime} &middot; {slot.level}
                                {unitFilter === 'todas' ? (
                                  <> &middot; {UNIT_LABELS[slot.unit]}</>
                                ) : null}
                              </p>
                            </div>
                            <span className="sr-only">
                              Modalidade {modalityLabel[slot.modality]}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <Reveal delay={0.1} className="mt-10">
          <div className="surface-card flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <p className="text-sm leading-relaxed text-muted">
              Não achou um horário que caiba na sua rotina? Fale com a gente pelo WhatsApp que
              a recepção confirma a turma ideal para você.
            </p>
            <a
              href={whatsappLink(whatsappMessages.schedule)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary shrink-0"
            >
              Confirmar horários
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
