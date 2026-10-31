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

/**
 * Campos de texto devolvidos ao formulário depois de um erro.
 *
 * O React 19 reseta os campos não controlados quando a action termina —
 * inclusive quando ela volta com erro. Sem devolver os valores, o aluno perdia
 * CPF, dados do responsável e o consentimento a cada dígito errado, e tinha de
 * anexar o documento de novo. Com eles, cada campo volta como `defaultValue`.
 */
export interface OnboardingValues {
  readonly name: string;
  readonly phone: string;
  readonly cpf: string;
  readonly birthDate: string;
  readonly guardianName: string;
  readonly guardianPhone: string;
  readonly guardianCpf: string;
  readonly gender: string;
  readonly unit: string;
  readonly consent: boolean;
}

export interface OnboardingState {
  readonly status: 'idle' | 'error' | 'success';
  readonly message: string;
  readonly fieldErrors: Readonly<Record<string, string>>;
  /** `null` no estado inicial: aí valem os valores vindos do servidor. */
  readonly values: OnboardingValues | null;
}

export const initialOnboardingState: OnboardingState = {
  status: 'idle',
  message: '',
  fieldErrors: {},
  values: null,
};
