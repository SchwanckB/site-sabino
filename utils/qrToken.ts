/**
 * Leitura do que a câmera decodificou.
 *
 * Morava dentro de `CheckinClient.tsx` e, por isso, não tinha teste nenhum —
 * foi onde se esconderam duas falhas: um QR que não fosse o da academia
 * devolvia string vazia e a tela travava sem mensagem, e um `?t=` vazio fazia o
 * mesmo. Como função pura dá para enumerar os casos.
 *
 * O cartaz codifica a URL da página de check-in já com o código, para a câmera
 * nativa do celular resolver tudo. Mas o leitor embutido aceita qualquer QR, e
 * o aluno vai apontar para QR de Wi-Fi, de nota fiscal e de rede social.
 */

/** Código lido, ou `null` quando o QR não é um código de presença. */
export function extractToken(decoded: string): string | null {
  const limpo = decoded.trim();
  if (limpo.length === 0) return null;

  // Limite defensivo: o validador recusa acima de 128, e um QR gigante não
  // deve nem chegar lá.
  if (limpo.length > 512) return null;

  let url: URL;
  try {
    url = new URL(limpo);
  } catch {
    // Não é URL: trata como o código puro, que é o formato antigo do cartaz.
    return limpo;
  }

  const fromQuery = url.searchParams.get('t')?.trim() ?? '';
  return fromQuery.length > 0 ? fromQuery : null;
}
