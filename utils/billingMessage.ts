/**
 * Mensagem de cobrança pronta para o WhatsApp.
 *
 * Função pura: recebe os dados da mensalidade e devolve o texto e o link.
 * Separada da tela porque o texto é a parte que o professor vai querer
 * ajustar, e porque o telefone brasileiro tem armadilhas suficientes para
 * merecer teste próprio.
 */

import { formatBr } from './datetime';
import { formatCents } from './paymentEngine';

/** DDI do Brasil. O wa.me exige o número em formato internacional. */
const BR = '55';

/**
 * Normaliza um telefone para o formato que o wa.me aceita.
 *
 * Aceita o que o cadastro realmente recebe: `(51) 98169-1373`, `51981691373`,
 * `+55 51 98169-1373`. Devolve `null` quando não dá para confiar no número —
 * é melhor não abrir conversa nenhuma do que abrir com o número errado.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return null;

  // Já veio com DDI.
  if (digits.startsWith(BR) && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  // DDD + número, com ou sem o nono dígito.
  if (digits.length === 10 || digits.length === 11) {
    return BR + digits;
  }

  return null;
}

export interface BillingInput {
  readonly name: string;
  readonly amountCents: number;
  /** `YYYY-MM-DD`. */
  readonly dueDate: string;
  /** `YYYY-MM-DD` — último dia sem atraso. */
  readonly limitDate: string;
  readonly openInstallments: number;
  readonly totalOpenCents: number;
  readonly overdue: boolean;
  /** Chave Pix da academia; vazio esconde a linha. */
  readonly pixKey: string;
  readonly academyName: string;
}

/**
 * Texto da cobrança.
 *
 * Escrito como o professor falaria na recepção: nome, o que é, quanto, até
 * quando. Sem "prezado cliente" e sem ameaça — o objetivo é o aluno pagar e
 * continuar vindo treinar.
 */
export function buildBillingMessage(input: BillingInput): string {
  const primeiroNome = input.name.trim().split(/\s+/)[0] ?? input.name;
  const linhas: string[] = [];

  linhas.push(`Olá, ${primeiroNome}! Tudo bem?`);
  linhas.push('');

  if (input.overdue) {
    const valor =
      input.openInstallments > 1
        ? `${input.openInstallments} mensalidades em aberto, total de ${formatCents(input.totalOpenCents)}`
        : `a mensalidade de ${formatCents(input.amountCents)}`;

    linhas.push(
      `Passando para lembrar ${input.openInstallments > 1 ? 'das' : 'da'} ${valor}, ` +
        `com vencimento em ${formatBr(input.dueDate)}.`,
    );
  } else {
    linhas.push(
      `Passando para lembrar da mensalidade de ${formatCents(input.amountCents)}, ` +
        `que vence em ${formatBr(input.dueDate)} (pode pagar até ${formatBr(input.limitDate)}).`,
    );
  }

  if (input.pixKey.trim().length > 0) {
    linhas.push('');
    linhas.push(`Chave Pix: ${input.pixKey.trim()}`);
    linhas.push('Se puder, manda o comprovante por aqui que eu já dou baixa no sistema.');
  } else {
    linhas.push('');
    linhas.push('Manda o comprovante por aqui que eu já dou baixa no sistema.');
  }

  linhas.push('');
  linhas.push(`Obrigado! — ${input.academyName}`);

  return linhas.join('\n');
}

/** Link do WhatsApp para um número específico, com a mensagem preenchida. */
export function whatsappLinkTo(phone: string, message: string): string | null {
  const numero = normalizePhone(phone);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(message)}`;
}

/* -------------------------------------------------------------------------- */
/* Recibo                                                                     */
/* -------------------------------------------------------------------------- */

export interface ReceiptInput {
  readonly name: string;
  readonly amountCents: number;
  /** ISO do pagamento. */
  readonly paidAt: string;
  /** `YYYY-MM-DD` do vencimento quitado. */
  readonly dueDate: string;
  readonly method: string;
  readonly academyName: string;
  readonly unitLabel: string;
}

/**
 * Recibo em texto, para mandar no WhatsApp.
 *
 * Texto e não PDF de propósito: o aluno recebe no mesmo lugar onde mandou o
 * comprovante, lê sem baixar nada e consegue encaminhar. Um PDF exigiria
 * biblioteca nova, abrir anexo no celular e não resolveria nada a mais.
 */
export function buildReceipt(input: ReceiptInput): string {
  const linhas: string[] = [];

  linhas.push(`*Recibo — ${input.academyName}*`);
  linhas.push(input.unitLabel);
  linhas.push('');
  linhas.push(`Aluno: ${input.name}`);
  linhas.push(`Valor: ${formatCents(input.amountCents)}`);
  linhas.push(`Referente a: mensalidade com vencimento em ${formatBr(input.dueDate)}`);
  linhas.push(`Forma: ${input.method}`);
  linhas.push(`Pago em: ${formatBr(input.paidAt.slice(0, 10))}`);
  linhas.push('');
  linhas.push('Obrigado! Bom treino.');

  return linhas.join('\n');
}
