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
 * Por isso `QR_TOKEN_SECRET` é opcional e tem queda para um valor fixo: ele
 * serve só para a URL não ser adivinhável de bate-pronto, não como fronteira
 * de segurança. Antes era obrigatório, e um ambiente sem a variável fazia a
 * tela do QR falhar inteira — ponto de falha sem contrapartida. Definir um
 * segredo próprio continua valendo: troca todos os códigos de uma vez, caso a
 * academia queira invalidar os cartazes antigos.
 */

const FALLBACK = 'sabino-checkin-v1';

function secret(): string {
  const value = process.env.QR_TOKEN_SECRET ?? '';
  return value.length >= 16 ? value : FALLBACK;
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
