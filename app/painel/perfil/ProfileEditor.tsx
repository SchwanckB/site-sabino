'use client';

import { useRef, useState } from 'react';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { BIO_MAX } from '@/lib/profileMediaRules';
import { PROFILE_IMAGE_ACCEPT_ATTR, PROFILE_IMAGE_LABEL } from '@/lib/profileMediaRules';
import { cn } from '@/lib/utils';

import {
  removeProfileImageAction,
  saveProfileAction,
  uploadProfileImageAction,
} from '../actions';

/**
 * Edição do perfil.
 *
 * A escolha de privacidade vem primeiro e com as consequências escritas, não
 * como um interruptor num canto: é a única decisão desta tela que uma pessoa
 * pode se arrepender de tomar sem entender. Padrão privado — publicar foto de
 * alguém por omissão não é um padrão, é um acidente.
 */
export function ProfileEditor({
  visibility,
  bio,
  hasAvatar,
  hasBanner,
  locked,
}: {
  readonly visibility: 'publico' | 'privado';
  readonly bio: string;
  readonly hasAvatar: boolean;
  readonly hasBanner: boolean;
  /**
   * Motivo de o perfil não estar no ar, quando não é a escolha do aluno.
   *
   * Perfil de menor esperando a gestão, ou ocultado pela moderação. A tela
   * continua editável de propósito: o aluno arruma a foto ou a bio e o perfil
   * entra assim que for liberado.
   */
  readonly locked: string | null;
}) {
  const [texto, setTexto] = useState(bio);
  const restante = BIO_MAX - texto.length;

  return (
    <div className="space-y-6">
      {locked ? (
        <p className="notice-warn px-4 py-3 text-sm leading-relaxed text-amber-100">{locked}</p>
      ) : null}

      {/* Quem vê ---------------------------------------------------------- */}
      <section className="panel panel-pad">
        <h2 className="panel-title">Quem pode ver seu perfil</h2>

        <ActionForm action={saveProfileAction} className="mt-3">
          <fieldset className="space-y-2">
            <legend className="sr-only">Visibilidade do perfil</legend>

            {(
              [
                {
                  id: 'privado',
                  titulo: 'Só eu',
                  detalhe:
                    'Ninguém além de você e da academia vê sua foto, seu banner e sua bio.',
                },
                {
                  id: 'publico',
                  titulo: 'Os colegas da academia',
                  detalhe:
                    'Alunos com conta ativa aqui podem abrir seu perfil. Não aparece no Google nem para quem não é da academia.',
                },
              ] as const
            ).map((opcao) => (
              <label
                key={opcao.id}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors',
                  'has-[:checked]:border-crimson has-[:checked]:bg-crimson/[.08]',
                  'border-hairline bg-white/[.03] hover:border-white/25',
                )}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={opcao.id}
                  defaultChecked={visibility === opcao.id}
                  className="mt-1 h-4 w-4 shrink-0 accent-crimson"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    {opcao.titulo}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                    {opcao.detalhe}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="mt-4">
            <label htmlFor="bio" className="block text-xs text-muted">
              Uma linha sobre você
            </label>
            <textarea
              id="bio"
              name="bio"
              rows={2}
              maxLength={BIO_MAX}
              value={texto}
              onChange={(event) => setTexto(event.target.value)}
              placeholder="Ex.: Treino desde 2019. Foco em guarda."
              className="mt-1 w-full rounded-xl border border-hairline bg-white/[.04] px-3 py-2 text-sm text-foreground placeholder:text-muted/70 focus:border-crimson focus:outline-none"
            />
            <p
              className={cn(
                'mt-1 text-right text-[11px]',
                restante < 20 ? 'text-amber-300' : 'text-muted',
              )}
            >
              {restante} {restante === 1 ? 'caractere' : 'caracteres'}
            </p>
          </div>

          <SubmitButton className="btn-primary mt-2 text-sm" pendingLabel="Salvando…">
            Salvar
          </SubmitButton>
        </ActionForm>
      </section>

      {/* Imagens ---------------------------------------------------------- */}
      <section className="panel panel-pad">
        <h2 className="panel-title">Foto e banner</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {PROFILE_IMAGE_LABEL}. A imagem é cortada e reduzida no envio — não guardamos o
          arquivo original nem os dados de localização que o celular grava nele.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ImageField
            kind="avatar"
            rotulo="Foto do perfil"
            dica="Quadrada. É ela que aparece na lista e no ranking."
            presente={hasAvatar}
          />
          <ImageField
            kind="banner"
            rotulo="Banner"
            dica="Larga e baixa, como a capa de uma rede social."
            presente={hasBanner}
          />
        </div>
      </section>
    </div>
  );
}

/**
 * Um campo de imagem.
 *
 * O envio dispara no `change` do input, sem botão: escolher o arquivo e depois
 * procurar "Enviar" é o passo em que a pessoa desiste — especialmente no
 * celular, onde o seletor de fotos cobre a tela e ela volta sem lembrar o que
 * faltava.
 */
function ImageField({
  kind,
  rotulo,
  dica,
  presente,
}: {
  readonly kind: 'avatar' | 'banner';
  readonly rotulo: string;
  readonly dica: string;
  readonly presente: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="rounded-xl border border-hairline bg-white/[.03] p-3.5">
      <p className="text-sm font-medium text-foreground">{rotulo}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">{dica}</p>

      <ActionForm action={uploadProfileImageAction} className="mt-3">
        <input type="hidden" name="kind" value={kind} />
        <input
          ref={undefined}
          type="file"
          name="file"
          accept={PROFILE_IMAGE_ACCEPT_ATTR}
          onChange={(event) => {
            if (event.target.files?.length) event.target.form?.requestSubmit();
          }}
          className="block w-full text-xs text-muted file:mr-3 file:min-h-[40px] file:cursor-pointer file:rounded-lg file:border-0 file:bg-white/[.08] file:px-3 file:text-xs file:text-foreground hover:file:bg-white/[.12]"
        />
        {/*
          O botão existe para quem está sem JavaScript: ali o `change` não
          envia nada, e sem ele o campo ficaria inerte.
        */}
        <noscript>
          <SubmitButton className="btn-secondary mt-2 text-xs" pendingLabel="Enviando…">
            Enviar
          </SubmitButton>
        </noscript>
      </ActionForm>

      {presente ? (
        <ActionForm
          action={removeProfileImageAction}
          className="mt-2"
          confirm={`Remover ${rotulo.toLowerCase()}?`}
        >
          <input type="hidden" name="kind" value={kind} />
          <SubmitButton className="btn-ghost text-xs" pendingLabel="…">
            Remover
          </SubmitButton>
        </ActionForm>
      ) : null}

      {/* `formRef` fica disponível para o envio sem botão acima. */}
      <span ref={formRef as unknown as React.Ref<HTMLSpanElement>} hidden />
    </div>
  );
}
