'use client';

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { SubmitButton } from '@/components/app/ActionForm';
import {
  ACCEPTED_DOCUMENT_LABEL,
  DOCUMENT_ACCEPT_ATTR,
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABELS,
  type DocumentKind,
} from '@/lib/documentRules';
import { cn } from '@/lib/utils';
import {
  GENDER_LABELS,
  GENDERS,
  GUARDIAN_REQUIRED_AGE,
  UNITS,
  UNIT_LABELS,
} from '@/types/domain';
import { calculateAge } from '@/utils/graduationEngine';

import { submitOnboarding } from './actions';
import { initialOnboardingState } from './state';

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
        <p id={`${name}-erro`} role="alert" className="mt-1.5 text-xs text-accent">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputClass =
  'w-full min-h-[44px] rounded-xl border border-hairline bg-white/[.04] px-4 py-3 text-base text-foreground placeholder:text-muted/70 transition-colors focus:border-crimson focus:outline-none';

export function OnboardingForm({
  defaultName,
  defaultPhone,
  defaultBirthDate,
  hasDocument,
  documentEnabled,
}: {
  readonly defaultName: string;
  readonly defaultPhone: string;
  readonly defaultBirthDate: string;
  readonly hasDocument: boolean;
  /** `false` quando ainda não há armazenamento de arquivos configurado. */
  readonly documentEnabled: boolean;
}) {
  /*
   * O arquivo escolhido fica guardado aqui entre as tentativas.
   *
   * O React 19 reseta os campos não controlados quando a action termina, e um
   * `<input type="file">` não pode ser repreenchido por código. Sem esta
   * lembrança, cada erro de validação obrigava o aluno a anexar o documento de
   * novo — no celular, na fila da recepção. Os campos de texto voltam pelo
   * `state.values`; o arquivo só volta por aqui.
   */
  const rememberedFile = useRef<File | null>(null);
  const [fileLabel, setFileLabel] = useState('');
  // Alterna o rótulo e a dica do campo de arquivo conforme a escolha.
  const [docKind, setDocKind] = useState<DocumentKind>('documento');

  const [state, action] = useActionState(
    async (previous: typeof initialOnboardingState, form: FormData) => {
      const picked = form.get('document');
      if (picked instanceof File && picked.size > 0) {
        rememberedFile.current = picked;
      } else if (rememberedFile.current) {
        form.set('document', rememberedFile.current);
      }
      return submitOnboarding(previous, form);
    },
    initialOnboardingState,
  );

  const sent = state.values;
  const [birthDate, setBirthDate] = useState(defaultBirthDate);
  /*
   * Começa vazia de propósito, e não em `DEFAULT_UNIT`: a escolha é do aluno.
   * O que foi enviado antes é recuperado para quem voltou de um erro de
   * validação não ter de escolher de novo.
   */
  const [unit, setUnit] = useState<string>(sent?.unit ?? '');
  const router = useRouter();
  const isMinor = useIsMinor(birthDate);

  useEffect(() => {
    if (state.status === 'success') {
      rememberedFile.current = null;
      router.push('/aguardando');
    }
  }, [state.status, router]);

  // A data de nascimento é controlada: realinha com o que o servidor recebeu
  // para que os campos do responsável não desapareçam depois de um erro.
  useEffect(() => {
    if (sent && sent.birthDate !== birthDate) setBirthDate(sent.birthDate);
    // Só quando o servidor responde — digitar não deve disparar isto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent]);

  const onPickFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null;
    if (picked) rememberedFile.current = picked;
    setFileLabel(rememberedFile.current?.name ?? '');
  }, []);

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
          defaultValue={sent?.name ?? defaultName}
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
            defaultValue={sent?.phone ?? defaultPhone}
            aria-invalid={Boolean(errors['phone'])}
            aria-describedby={errors['phone'] ? 'phone-erro' : undefined}
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
            defaultValue={sent?.cpf ?? ''}
            aria-invalid={Boolean(errors['cpf'])}
            aria-describedby={errors['cpf'] ? 'cpf-erro' : undefined}
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
          aria-describedby={errors['birthDate'] ? 'birthDate-erro' : undefined}
          className={inputClass}
        />
      </Field>

      {/*
        Academia em duas opções grandes, sem nenhuma pré-selecionada.

        Era um `select` já marcado em Três Cachoeiras: quem não abria o campo
        — a maioria — entrava lá por omissão, inclusive os alunos de Terra de
        Areia. O erro só aparecia na aprovação, com as turmas da academia
        errada para marcar, e corrigir exigia mexer na ficha depois.
      */}
      <Field
        label="Em qual academia você vai treinar?"
        name="unit"
        error={errors['unit']}
        hint="Escolha obrigatória: é ela que define a sua grade de horários."
      >
        <div role="radiogroup" aria-label="Academia" className="grid gap-2 sm:grid-cols-2">
          {UNITS.map((value) => (
            <label
              key={value}
              className={cn(
                'flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors',
                unit === value
                  ? 'border-crimson bg-crimson/[.08] text-foreground'
                  : 'border-hairline bg-white/[.03] text-muted hover:border-white/25',
              )}
            >
              <input
                type="radio"
                name="unit"
                value={value}
                checked={unit === value}
                onChange={() => setUnit(value)}
                className="h-4 w-4 shrink-0 accent-crimson"
              />
              <span className="min-w-0">
                <span className="block font-medium text-foreground">{UNIT_LABELS[value]}</span>
              </span>
            </label>
          ))}
        </div>
      </Field>

      <Field
        label="Sexo"
        name="gender"
        hint="Usado para organizar as turmas (inclusive a feminina) e os relatórios."
      >
        <select
          id="gender"
          name="gender"
          defaultValue={sent?.gender || 'nao_informado'}
          className={inputClass}
        >
          {GENDERS.map((value) => (
            <option key={value} value={value}>
              {GENDER_LABELS[value]}
            </option>
          ))}
        </select>
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
              defaultValue={sent?.guardianName ?? ''}
              aria-invalid={Boolean(errors['guardianName'])}
              aria-describedby={errors['guardianName'] ? 'guardianName-erro' : undefined}
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
                defaultValue={sent?.guardianPhone ?? ''}
                aria-invalid={Boolean(errors['guardianPhone'])}
                aria-describedby={errors['guardianPhone'] ? 'guardianPhone-erro' : undefined}
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
                defaultValue={sent?.guardianCpf ?? ''}
                aria-invalid={Boolean(errors['guardianCpf'])}
                aria-describedby={errors['guardianCpf'] ? 'guardianCpf-erro' : undefined}
                className={inputClass}
              />
            </Field>
          </div>
        </fieldset>
      ) : null}

      {/*
        Duas opções de anexo.

        Nem todo mundo se sente à vontade mandando RG ou CNH para uma academia,
        e barrar a matrícula por isso custa aluno. A foto do rosto resolve o uso
        cotidiano do anexo, que é a recepção reconhecer quem chega. O tipo vai
        gravado para o professor saber, na hora de aprovar, o que tem em mãos.
      */}
      {documentEnabled ? (
        <>
      <fieldset className="mt-6">
        <legend className="text-sm font-medium text-foreground">O que você vai enviar</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {DOCUMENT_KINDS.map((kind) => (
            <label
              key={kind}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-hairline bg-white/[.04] px-4 py-3 text-sm transition-colors hover:border-crimson/50 has-[:checked]:border-crimson has-[:checked]:bg-crimson/[.07]"
            >
              <input
                type="radio"
                name="docKind"
                value={kind}
                defaultChecked={(sent?.docKind ?? 'documento') === kind}
                onChange={() => setDocKind(kind)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-crimson"
              />
              <span>{DOCUMENT_KIND_LABELS[kind]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        label={docKind === 'foto' ? 'Foto do aluno' : 'Documento com foto'}
        name="document"
        error={errors['document']}
        hint={
          fileLabel
            ? `${fileLabel} — anexado. Escolha outro arquivo só se quiser trocar.`
            : hasDocument
              ? `Já temos um arquivo seu. Envie outro só se quiser substituir. ${ACCEPTED_DOCUMENT_LABEL}.`
              : docKind === 'foto'
                ? `Uma foto do rosto, de frente e com boa luz. ${ACCEPTED_DOCUMENT_LABEL}.`
                : `RG, CNH ou certidão de nascimento. ${ACCEPTED_DOCUMENT_LABEL}.`
        }
      >
        <input
          id="document"
          name="document"
          type="file"
          accept={DOCUMENT_ACCEPT_ATTR}
          onChange={onPickFile}
          aria-invalid={Boolean(errors['document'])}
          aria-describedby={errors['document'] ? 'document-erro' : undefined}
          className={cn(
            inputClass,
            'file:mr-4 file:rounded-lg file:border-0 file:bg-crimson file:px-4 file:py-2 file:text-sm file:font-semibold file:text-foreground',
          )}
        />
      </Field>
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-hairline px-4 py-3 text-xs leading-relaxed text-muted">
          O envio de arquivo está temporariamente indisponível. Siga com o cadastro — a
          academia resolve isso pessoalmente na primeira aula.
        </p>
      )}

      <div>
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-muted">
          <input
            type="checkbox"
            name="consent"
            defaultChecked={sent?.consent ?? false}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-hairline bg-white/[.06] accent-crimson"
            aria-invalid={Boolean(errors['consent'])}
            aria-describedby={errors['consent'] ? 'consent-erro' : undefined}
          />
          <span>
            Autorizo a Sabino Academia a usar meus dados e o documento enviado exclusivamente
            para a matrícula e o controle de frequência e mensalidade. Posso pedir a exclusão a
            qualquer momento.
          </span>
        </label>
        {/*
          O `id` casa com o `aria-describedby` da caixa. Este campo não passa
          pelo `Field` — a etiqueta envolve a caixa — então o id é escrito à
          mão, no mesmo padrão `<campo>-erro` que o `Field` gera.
        */}
        {errors['consent'] ? (
          <p id="consent-erro" role="alert" className="mt-1.5 text-xs text-accent">
            {errors['consent']}
          </p>
        ) : null}
      </div>

      <SubmitButton className="btn-primary w-full sm:w-auto sm:px-8" pendingLabel="Enviando…">
        Enviar cadastro
      </SubmitButton>
    </form>
  );
}
