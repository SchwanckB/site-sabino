/**
 * Leitura de `FormData` nas Server Actions.
 *
 * Estava duplicado, idêntico, em `app/admin/actions.ts` e
 * `app/onboarding/actions.ts`. Nenhum dos dois é o dono natural do helper, e
 * duas cópias são duas chances de divergirem na hora de tratar o caso em que o
 * campo chega como `File` em vez de texto.
 */

/** Texto do campo, já sem espaços nas pontas. Vazio quando ausente. */
export function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/** `true` só quando a caixa foi marcada — ausente no envio significa desmarcada. */
export function checkbox(form: FormData, key: string): boolean {
  return form.get(key) === 'on';
}

/** Todos os valores de texto de um campo repetido (checkbox múltiplo, select). */
export function textList(form: FormData, key: string): string[] {
  return form.getAll(key).filter((value): value is string => typeof value === 'string');
}

/**
 * Inteiro dentro de uma faixa fechada, ou `null` se não der para usar.
 *
 * `Number('')` é 0 e `Number('abc')` é `NaN` — os dois passariam por uma
 * checagem solta e virariam dado inválido no banco. Aqui o limite é explícito
 * e a recusa é o retorno, não um valor de consolo.
 */
export function intInRange(
  form: FormData,
  key: string,
  min: number,
  max: number,
): number | null {
  const raw = text(form, key);
  if (raw.length === 0) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;

  const whole = Math.trunc(parsed);
  return whole >= min && whole <= max ? whole : null;
}
