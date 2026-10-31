import 'server-only';

import { createHmac } from 'node:crypto';

import { UNITS, isUnitId, type UnitId } from '@/types/domain';

/**
 * Código de presença da academia — **um por unidade**, fixo e imprimível.
 *
 * Era um código por turma, e isso obrigava a imprimir e manter uma folha para
 * cada horário da grade. Agora é um cartaz só por academia: o aluno escaneia,
 * e quem escolhe a aula é ele, no próprio painel, entre as turmas dele que
 * estão acontecendo naquele momento.
 *
 * O código é por unidade, e não um só para a rede, porque senão o cartaz de
 * Três Cachoeiras serviria em Terra de Areia.
 *
 * **O código não é segredo.** Ele fica colado na parede; qualquer aluno pode
 * fotografá-lo. Quem impede o check-in de casa são outras três travas:
 *
 *   1. **janela de horário** — só vale enquanto a aula está acontecendo;
 *   2. **matrícula na turma** — o aluno só marca presença em turma dele;
 *   3. **uma presença por dia**, garantida por `SET NX` atômico.
 *
 * Mesmo assim o segredo importa, e a queda para um valor fixo tem um custo que
 * antes ficava invisível: a constante está no repositório, então qualquer
 * pessoa com acesso ao código calcula o token de qualquer unidade sem nunca
 * pisar na academia. Somado às três travas acima, sobra uma brecha real — o
 * aluno matriculado que marca presença de casa, no horário da própria aula. E
 * presença alimenta graduação.
 *
 * Por isso a queda agora vale **só fora de produção**, onde serve para o `dev`
 * rodar sem configurar nada. Em produção a ausência do segredo é registrada em
 * log a cada geração: o cartaz continua funcionando — derrubar o check-in da
 * academia inteira seria pior — mas o problema para de ser silencioso.
 *
 * Definir `QR_TOKEN_SECRET` também é o que permite invalidar os cartazes
 * antigos de uma vez, trocando o valor.
 */

const DEV_FALLBACK = 'sabino-checkin-v1';
const MIN_SECRET_LENGTH = 16;

let avisou = false;

function secret(): string {
  const value = process.env.QR_TOKEN_SECRET ?? '';
  if (value.length >= MIN_SECRET_LENGTH) return value;

  if (process.env.NODE_ENV === 'production' && !avisou) {
    avisou = true;
    console.error(
      '[qr] QR_TOKEN_SECRET ausente ou com menos de ' +
        MIN_SECRET_LENGTH +
        ' caracteres. Os códigos de presença estão derivados da constante pública do repositório e podem ser calculados por quem tiver acesso ao código. Defina a variável na Vercel.',
    );
  }

  return DEV_FALLBACK;
}

/** `true` quando o segredo próprio está configurado. Alimenta o diagnóstico. */
export function isQrSecretConfigured(): boolean {
  return (process.env.QR_TOKEN_SECRET ?? '').length >= MIN_SECRET_LENGTH;
}

export interface QrToken {
  readonly token: string;
  readonly unit: UnitId;
}

/** Código fixo da unidade. Nunca falha: o segredo tem queda. */
export function qrTokenFor(unit: UnitId): string {
  return createHmac('sha256', secret())
    .update(`checkin:${unit}`)
    .digest('base64url')
    .slice(0, 24);
}

export function getCurrentQrToken(unit: UnitId): QrToken {
  return { token: qrTokenFor(unit), unit };
}

export type QrValidation =
  | { readonly ok: true; readonly unit: UnitId }
  | { readonly ok: false; readonly reason: 'qr_invalido' };

/**
 * Resolve o código lido pela câmera de volta para a academia.
 *
 * Também aceita o id da unidade puro: um QR antigo ou um link colado à mão
 * continuam levando o aluno para a tela certa, em vez de um erro seco.
 */
export function validateQrToken(token: string): QrValidation {
  const clean = token.trim();
  if (clean.length === 0 || clean.length > 128) {
    return { ok: false, reason: 'qr_invalido' };
  }

  if (isUnitId(clean)) return { ok: true, unit: clean };

  for (const unit of UNITS) {
    if (qrTokenFor(unit) === clean) return { ok: true, unit };
  }

  return { ok: false, reason: 'qr_invalido' };
}
