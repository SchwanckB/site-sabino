'use client';

import { useRef, useState } from 'react';

import { cn } from '@/lib/utils';

type TabId = 'kids' | 'adultos';

/**
 * Abas da graduação, com navegação por setas.
 *
 * Os painéis chegam prontos do servidor: a aba só decide qual aparece, sem
 * duplicar busca de dados.
 */
export function GraduationTabs({
  kids,
  adults,
  kidsCount,
  adultsCount,
}: {
  readonly kids: React.ReactNode;
  readonly adults: React.ReactNode;
  readonly kidsCount: number;
  readonly adultsCount: number;
}) {
  const [active, setActive] = useState<TabId>('kids');
  const refs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  const tabs: readonly { id: TabId; label: string; badge: number }[] = [
    { id: 'kids', label: 'Crianças', badge: kidsCount },
    { id: 'adultos', label: 'Adultos', badge: adultsCount },
  ];

  const onKeyDown = (event: React.KeyboardEvent, index: number): void => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();

    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    if (!next) return;

    setActive(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label="Visões da graduação" className="flex gap-1 overflow-x-auto border-b border-hairline">
        {tabs.map((tab, index) => {
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                refs.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`painel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                'relative flex min-h-[44px] items-center gap-2 whitespace-nowrap px-4 pb-3 pt-2 text-sm font-medium transition-colors',
                selected ? 'text-foreground' : 'text-muted hover:text-foreground',
              )}
            >
              {tab.label}
              {tab.badge > 0 ? (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                    selected ? 'bg-crimson text-foreground' : 'bg-white/10 text-muted',
                  )}
                >
                  {tab.badge}
                </span>
              ) : null}
              {selected ? (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-crimson" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="painel-kids" aria-labelledby="tab-kids" hidden={active !== 'kids'} tabIndex={0} className="mt-6">
        {active === 'kids' ? kids : null}
      </div>
      <div role="tabpanel" id="painel-adultos" aria-labelledby="tab-adultos" hidden={active !== 'adultos'} tabIndex={0} className="mt-6">
        {active === 'adultos' ? adults : null}
      </div>
    </div>
  );
}
