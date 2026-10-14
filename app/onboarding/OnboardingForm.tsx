'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';

import { ACCEPTED_DOCUMENT_LABEL, DOCUMENT_ACCEPT_ATTR } from '@/lib/documentRules';
import { cn } from '@/lib/utils';
import { GUARDIAN_REQUIRED_AGE } from '@/types/domain';
import { calculateAge } from '@/utils/graduationEngine';

import { initialOnboardingState, submitOnboarding } from './actions';

/** Campos do responsável aparecem só quando a data de nascimento indica menor. */
function useIsMinor(birthDate: string): boolean {
  return useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false;
    const age = calculateAge(birthDate, new Date());
    return age > 0 && age < GUARDIAN_REQUIRED_AGE;
  }, [birthDate]);
}

function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  readonly label: string;
  readonly name: string;
  readonly error?: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      <div className="mt-2">{children}</div>
      {error ? (
        <p id={`${name}-erro`} role="alert" className="mt-1.5 text-xs text-crimson">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputClass =
  'w-full min-h-[44px] rounded-xl border border-hairline bg-white/[.04] px-4 py-3 text-base text-foreground placeholder:text-muted/70 transition-colors focus:border-crimson focus:outline-none';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto sm:px-8">
      {pending ? 'Enviando…' : 'Enviar cadastro'}
    </button>
  );
}

export function OnboardingForm({
  defaultName,
  defaultPhone,
  defaultBirthDate,
  hasDocument,
}: {
  readonly defaultName: string;
  readonly defaultPhone: string;
  readonly defaultBirthDate: string;
  readonly hasDocument: boolean;
}) {
  const [state, action] = useActionState(submitOnboarding, initialOnboardingState);
  const [birthDate, setBirthDate] = useState(defaultBirthDate);
  const router = useRouter();
  const isMinor = useIsMinor(birthDate);

  useEffect(() => {
    if (state.status === 'success') {
      router.push('/aguardando');
    }
  }, [state.status, router]);

  const errors = state.fieldErrors;

  return (
    <form action={action} className="space-y-6" noValidate>
      {state.status === 'error' && state.message ? (
        <p
          role="alert"
          className="rounded-xl border border-crimson/40 bg-crimson/[.08] px-4 py-3 text-sm text-foreground"
        >
          {state.message}
        </p>
      ) : null}

      <Field label="Nome completo" name="name" error={errors['name']}>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          defaultValue={defaultName}
          aria-invalid={Boolean(errors['name'])}
          aria-describedby={errors['name'] ? 'name-erro' : undefined}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Telefone com DDD" name="phone" error={errors['phone']}>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(51) 99999-9999"
            defaultValue={defaultPhone}
            aria-invalid={Boolean(errors['phone'])}
            className={inputClass}
          />
        </Field>

        <Field label="CPF" name="cpf" error={errors['cpf']}>
          <input
            id="cpf"
            name="cpf"
            type="text"
            inputMode="numeric"
            placeholder="000.000.000-00"
            aria-invalid={Boolean(errors['cpf'])}
            className={inputClass}
          />
        </Field>
      </div>

      <Field
        label="Data de nascimento"
        name="birthDate"
        error={errors['birthDate']}
        hint="Define a turma e a trilha de graduação (infantil até 15 anos)."
      >
        <input
          id="birthDate"
          name="birthDate"
          type="date"
          value={birthDate}
          onChange={(event) => setBirthDate(event.target.value)}
          aria-invalid={Boolean(errors['birthDate'])}
          className={inputClass}
        />
      </Field>

      {isMinor ? (
        <fieldset className="surface-card space-y-6 p-5">
          <legend className="px-1 text-sm font-medium text-foreground">
            Dados do responsável
          </legend>
          <p className="text-xs leading-relaxed text-muted">
            Menores de {GUARDIAN_REQUIRED_AGE} anos precisam de um responsável registrado na
            matrícula.
          </p>

          <Field label="Nome do responsável" name="guardianName" error={errors['guardianName']}>
            <input
              id="guardianName"
              name="guardianName"
              type="text"
              aria-invalid={Boolean(errors['guardianName'])}
              className={inputClass}
            />
          </Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field
              label="Telefone do responsável"
              name="guardianPhone"
              error={errors['guardianPhone']}
            >
              <input
                id="guardianPhone"
                name="guardianPhone"
                type="tel"
                inputMode="tel"
                placeholder="(51) 99999-9999"
                aria-invalid={Boolean(errors['guardianPhone'])}
                className={inputClass}
              />
            </Field>

            <Field
              label="CPF do responsável"
              name="guardianCpf"
              error={errors['guardianCpf']}
              hint="Opcional"
            >
              <input
                id="guardianCpf"
                name="guardianCpf"
                type="text"
                inputMode="numeric"
                placeholder="000.000.000-00"
                aria-invalid={Boolean(errors['guardianCpf'])}
                className={inputClass}
              />
            </Field>
          </div>
        </fieldset>
      ) : null}

      <Field
        label="Documento com foto"
        name="document"
        error={errors['document']}
        hint={
          hasDocument
            ? `Já temos um documento seu. Envie outro só se quiser substituir. ${ACCEPTED_DOCUMENT_LABEL}.`
            : `RG, CNH ou certidão de nascimento. ${ACCEPTED_DOCUMENT_LABEL}.`
        }
      >
        <input
          id="document"
          name="document"
          type="file"
          accept={DOCUMENT_ACCEPT_ATTR}
          aria-invalid={Boolean(errors['document'])}
          className={cn(
            inputClass,
            'file:mr-4 file:rounded-lg file:border-0 file:bg-crimson file:px-4 file:py-2 file:text-sm file:font-semibold file:text-foreground',
          )}
        />
      </Field>

      <div>
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-muted">
          <input
            type="checkbox"
            name="consent"
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-hairline bg-white/[.06] accent-crimson"
            aria-invalid={Boolean(errors['consent'])}
          />
          <span>
            Autorizo a Sabino Academia a usar meus dados e o documento enviado exclusivamente
            para a matrícula e o controle de frequência e mensalidade. Posso pedir a exclusão a
            qualquer momento.
          </span>
        </label>
        {errors['consent'] ? (
          <p role="alert" className="mt-1.5 text-xs text-crimson">
            {errors['consent']}
          </p>
        ) : null}
      </div>

      <SubmitButton />
    </form>
  );
}
