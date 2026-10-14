'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { cn } from '@/lib/utils';

export interface ActionResult {
  readonly ok: boolean;
  readonly message: string;
}

const idle: ActionResult = { ok: true, message: '' };

/**
 * Formulário ligado a uma Server Action, com estado de envio e retorno.
 *
 * Centraliza o padrão para que nenhuma tela do admin precise reimplementar
 * "desabilitar enquanto envia" nem "mostrar o resultado" — e para que o aviso
 * saia sempre com `role="status"`, lido por leitor de tela.
 */
export function ActionForm({
  action,
  children,
  className,
  confirm,
  onDone,
}: {
  readonly action: (form: FormData) => Promise<ActionResult>;
  readonly children: React.ReactNode;
  readonly className?: string;
  /** Texto do `confirm()` antes de enviar. Use em ações destrutivas. */
  readonly confirm?: string;
  readonly onDone?: (result: ActionResult) => void;
}) {
  const [state, formAction] = useActionState(
    async (_previous: ActionResult, form: FormData): Promise<ActionResult> => {
      const result = await action(form);
      onDone?.(result);
      return result;
    },
    idle,
  );

  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) {
          event.preventDefault();
        }
      }}
    >
      {children}
      {state.message ? (
        <p
          role="status"
          className={cn(
            'mt-3 rounded-lg px-3 py-2 text-xs leading-relaxed',
            state.ok
              ? 'bg-emerald-500/10 text-emerald-300'
              : 'bg-crimson/10 text-crimson',
          )}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/** Botão que se desabilita sozinho durante o envio. */
export function SubmitButton({
  children,
  className = 'btn-primary',
  pendingLabel = 'Salvando…',
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : children}
    </button>
  );
}
