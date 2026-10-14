/**
 * Estado do formulário de pré-cadastro.
 *
 * Mora fora de `actions.ts` por uma regra do Next: um módulo `'use server'` só
 * pode exportar funções assíncronas. Exportar a constante de estado inicial de
 * lá compilava sem reclamar, mas no navegador ela chegava como uma referência
 * de servidor vazia — `state.fieldErrors` virava `undefined` e o formulário
 * quebrava com "Cannot read properties of undefined (reading 'name')" assim
 * que o aluno abria a página.
 */

export interface OnboardingState {
  readonly status: 'idle' | 'error' | 'success';
  readonly message: string;
  readonly fieldErrors: Readonly<Record<string, string>>;
}

export const initialOnboardingState: OnboardingState = {
  status: 'idle',
  message: '',
  fieldErrors: {},
};
