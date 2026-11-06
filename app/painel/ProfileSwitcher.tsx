'use client';

import { useState } from 'react';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { cn, initials } from '@/lib/utils';
import { UNIT_LABELS, type UnitId } from '@/types/domain';

import { registerDependentAction, switchProfileAction } from './actions';

export interface ProfileOption {
  readonly id: string;
  readonly name: string;
  /** `Você`, `Infantil`, `Aguardando aprovação`. */
  readonly detail: string;
  readonly active: boolean;
  /** `false` enquanto a recepção não aprovou: o perfil existe mas não treina. */
  readonly ready: boolean;
}

const inputClass =
  'w-full min-h-[44px] rounded-xl border border-hairline bg-white/[.04] px-3 py-2 text-sm text-foreground focus:border-crimson focus:outline-none';

/**
 * Troca de perfil dentro da mesma conta.
 *
 * O pai treina nos adultos e o filho de seis anos treina no infantil. Criar um
 * login para a criança é pedir ao pai que invente uma caixa de entrada e
 * depois lembre de duas senhas — então a ficha dela pendura na conta dele, e
 * aqui ele escolhe de quem é a tela. É o mesmo gesto que já existe entre
 * "meu painel de aluno" e "painel do professor".
 *
 * Com um perfil só, o seletor não aparece: fica apenas o convite para
 * cadastrar alguém da família, e discreto.
 */
export function ProfileSwitcher({
  profiles,
  canAdd,
  units,
  defaultUnit,
  today,
}: {
  readonly profiles: readonly ProfileOption[];
  /** `false` para quem já é um dependente: vínculo não encadeia. */
  readonly canAdd: boolean;
  readonly units: readonly UnitId[];
  readonly defaultUnit: UnitId;
  /** Hoje em São Paulo: teto do campo de nascimento. */
  readonly today: string;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="panel panel-pad">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="panel-title">
          {profiles.length > 1 ? 'Quem está treinando' : 'Minha família na academia'}
        </h2>

        {canAdd ? (
          <button
            type="button"
            onClick={() => setAdding((open) => !open)}
            className="btn-ghost text-xs"
          >
            {adding ? 'Cancelar' : '+ Cadastrar familiar'}
          </button>
        ) : null}
      </div>

      {profiles.length > 1 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {profiles.map((profile) => (
            <li key={profile.id}>
              {/*
                Um formulário por perfil, e não um `select`: a troca é uma
                gravação no servidor (o cookie), e o caminho mais curto para
                isso continuar funcionando sem JavaScript é um botão de envio.
                `form` cru porque a action não devolve mensagem — a tela
                inteira troca, e isso já diz o que aconteceu.
              */}
              <form action={switchProfileAction}>
                <input type="hidden" name="studentId" value={profile.id} />
                <button
                  type="submit"
                  aria-current={profile.active ? 'true' : undefined}
                  className={cn(
                    'flex min-h-[56px] items-center gap-3 rounded-xl border px-3.5 text-left transition-colors',
                    profile.active
                      ? 'border-crimson bg-crimson/15'
                      : 'border-hairline bg-white/[.04] hover:border-white/25',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline bg-white/[.06] font-display text-xs text-muted"
                  >
                    {initials(profile.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {profile.name.split(' ')[0]}
                    </span>
                    <span
                      className={cn(
                        'block truncate text-[11px]',
                        profile.ready ? 'text-muted' : 'text-amber-300',
                      )}
                    >
                      {profile.detail}
                    </span>
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Seu filho ou sua esposa treina aqui? Cadastre na sua conta — não precisa de outro
          e-mail, e você alterna entre os perfis nesta tela.
        </p>
      )}

      {adding ? (
        <ActionForm
          action={registerDependentAction}
          className="mt-4 border-t border-hairline pt-4"
          onDone={(result) => {
            if (result.ok) setAdding(false);
          }}
        >
          <p className="text-sm font-medium text-foreground">Cadastrar alguém da família</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            A recepção aprova e define a turma. Seu telefone e seus dados de responsável vão
            junto — não precisa digitar de novo.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="dep-name" className="block text-xs text-muted">
                Nome completo
              </label>
              <input
                id="dep-name"
                name="name"
                type="text"
                required
                autoComplete="off"
                className={cn(inputClass, 'mt-1')}
              />
            </div>

            <div>
              <label htmlFor="dep-birth" className="block text-xs text-muted">
                Data de nascimento
              </label>
              <input
                id="dep-birth"
                name="birthDate"
                type="date"
                required
                max={today}
                className={cn(inputClass, 'mt-1')}
              />
            </div>

            <div>
              <label htmlFor="dep-gender" className="block text-xs text-muted">
                Sexo
              </label>
              <select id="dep-gender" name="gender" className={cn(inputClass, 'mt-1')}>
                <option value="nao_informado">Prefiro não informar</option>
                <option value="masculino">Masculino</option>
                <option value="feminino">Feminino</option>
              </select>
            </div>

            <div>
              <label htmlFor="dep-unit" className="block text-xs text-muted">
                Academia
              </label>
              <select
                id="dep-unit"
                name="unit"
                defaultValue={defaultUnit}
                className={cn(inputClass, 'mt-1')}
              >
                {units.map((unit) => (
                  <option key={unit} value={unit}>
                    {UNIT_LABELS[unit]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="dep-cpf" className="block text-xs text-muted">
                CPF <span className="text-muted/70">(opcional)</span>
              </label>
              <input
                id="dep-cpf"
                name="cpf"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Pode deixar em branco"
                className={cn(inputClass, 'mt-1')}
              />
            </div>
          </div>

          <div className="mt-4">
            <SubmitButton className="btn-primary text-sm" pendingLabel="Enviando…">
              Enviar para aprovação
            </SubmitButton>
          </div>
        </ActionForm>
      ) : null}
    </section>
  );
}
