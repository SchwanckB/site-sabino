/**
 * Validação de CPF com dígitos verificadores. Função pura, sem I/O.
 *
 * O CPF é dado pessoal sensível: ele é guardado apenas no servidor e as telas
 * recebem no máximo a versão mascarada de {@link maskCpf}.
 */

/** Remove tudo que não é dígito. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Valida um CPF pelos dois dígitos verificadores.
 * Rejeita sequências repetidas (`111.111.111-11`), que passam no cálculo mas
 * nunca são emitidas.
 */
export function isValidCpf(value: string): boolean {
  const digits = onlyDigits(value);

  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const checkDigit = (length: number): number => {
    let sum = 0;
    for (let index = 0; index < length; index++) {
      sum += Number(digits[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
}

/** `12345678909` → `123.456.789-09`. Só para uso no servidor. */
export function formatCpf(value: string): string {
  const digits = onlyDigits(value);
  if (digits.length !== 11) return value;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/**
 * `12345678909` → `•••.•••.•••-09`.
 * É esta forma que pode chegar ao cliente: confirma identidade sem expor o
 * número completo.
 */
export function maskCpf(value: string): string {
  const digits = onlyDigits(value);
  if (digits.length !== 11) return '•••.•••.•••-••';
  return `•••.•••.•••-${digits.slice(9)}`;
}
