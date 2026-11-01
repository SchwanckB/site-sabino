'use client';

import { useState } from 'react';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';

import { deleteStudentAction } from '../../actions';

/**
 * Confirmação por digitação do nome.
 *
 * Uma caixa de `confirm()` sozinha é um clique de distância de apagar a ficha
 * errada — e numa academia com dois "Pedro" isso acontece. Digitar o nome
 * obriga a olhar para quem está sendo apagado, e o botão só habilita quando
 * bate. O servidor confere de novo: a trava daqui é conveniência, não
 * segurança.
 */
export function DeleteStudentForm({
  studentId,
  studentName,
}: {
  readonly studentId: string;
  readonly studentName: string;
}) {
  const [digitado, setDigitado] = useState('');
  const confere = digitado.trim().toLowerCase() === studentName.trim().toLowerCase();

  return (
    <ActionForm
      action={deleteStudentAction}
      className="mt-5"
      confirm={`Apagar em definitivo o cadastro de ${studentName}, incluindo o login? Isto não tem desfazer.`}
    >
      <input type="hidden" name="studentId" value={studentId} />

      <label htmlFor="confirmName" className="block text-xs text-muted">
        Para confirmar, digite <strong className="text-foreground">{studentName}</strong>
      </label>
      <input
        id="confirmName"
        name="confirmName"
        type="text"
        autoComplete="off"
        value={digitado}
        onChange={(event) => setDigitado(event.target.value)}
        aria-describedby="confirmName-ajuda"
        className="mt-1.5 w-full min-h-[44px] max-w-sm rounded-xl border border-crimson/40 bg-white/[.04] px-3 py-2 text-sm text-foreground focus:border-crimson focus:outline-none"
      />
      <p id="confirmName-ajuda" className="sr-only">
        O nome precisa bater com o da ficha para liberar a exclusão.
      </p>

      <SubmitButton
        className="btn-primary mt-3 bg-crimson hover:bg-crimson-hover disabled:cursor-not-allowed disabled:opacity-40"
        pendingLabel="Apagando…"
        disabled={!confere}
      >
        Apagar cadastro para sempre
      </SubmitButton>
    </ActionForm>
  );
}
