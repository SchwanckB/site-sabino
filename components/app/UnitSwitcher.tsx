'use client';

import { useRef } from 'react';

import { Icon } from '@/components/app/Icon';
import { UNIT_SCOPE_LABELS, UNITS, type UnitScope } from '@/types/domain';

/**
 * Seletor da academia mostrada no painel.
 *
 * Envia sozinho ao trocar: um botão "aplicar" ao lado de um select de três
 * opções só adiciona um toque a quem está com o celular na mão no tatame.
 * Dentro de um `<form>` de verdade, continua funcionando sem JavaScript.
 */
export function UnitSwitcher({
  scope,
  action,
}: {
  readonly scope: UnitScope;
  readonly action: (form: FormData) => void | Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="flex min-w-0 items-center gap-2">
      <Icon name="unidade" className="h-4 w-4 shrink-0 text-muted" />
      <label className="min-w-0">
        <span className="sr-only">Academia mostrada no painel</span>
        <select
          name="scope"
          defaultValue={scope}
          onChange={() => formRef.current?.requestSubmit()}
          className="min-h-[44px] w-full max-w-[12.5rem] truncate rounded-xl border border-hairline bg-white/[.04] px-2.5 text-sm font-medium text-foreground focus:border-crimson focus:outline-none"
        >
          <option value="todas">{UNIT_SCOPE_LABELS['todas']}</option>
          {UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {UNIT_SCOPE_LABELS[unit]}
            </option>
          ))}
        </select>
      </label>
      <noscript>
        <button type="submit" className="btn-ghost text-xs">
          Trocar
        </button>
      </noscript>
    </form>
  );
}
