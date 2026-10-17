import { describe, expect, it } from 'vitest';

import { formatCents } from './paymentEngine';

import {
  buildBillingMessage,
  normalizePhone,
  whatsappLinkTo,
  type BillingInput,
} from './billingMessage';

const base: BillingInput = {
  name: 'Ana Clara Figueiredo',
  amountCents: 15_000,
  dueDate: '2026-03-11',
  limitDate: '2026-03-15',
  openInstallments: 1,
  totalOpenCents: 15_000,
  overdue: false,
  pixKey: '51981691373',
  academyName: 'Sabino Academia',
};

describe('normalizePhone', () => {
  it('aceita o formato que o cadastro grava', () => {
    expect(normalizePhone('51981691373')).toBe('5551981691373');
    expect(normalizePhone('(51) 98169-1373')).toBe('5551981691373');
    expect(normalizePhone('51 98169 1373')).toBe('5551981691373');
  });

  it('aceita número fixo de oito dígitos', () => {
    expect(normalizePhone('(51) 3664-1234')).toBe('555136641234');
  });

  it('não duplica o DDI quando já veio com ele', () => {
    expect(normalizePhone('5551981691373')).toBe('5551981691373');
    expect(normalizePhone('+55 51 98169-1373')).toBe('5551981691373');
    expect(normalizePhone('555136641234')).toBe('555136641234');
  });

  it('recusa o que não dá para confiar', () => {
    // Abrir conversa com o número errado é pior do que não abrir nenhuma.
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('981691373')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('5551981691373999')).toBeNull();
  });
});

describe('buildBillingMessage', () => {
  it('chama o aluno pelo primeiro nome', () => {
    expect(buildBillingMessage(base)).toContain('Olá, Ana!');
  });

  it('traz valor, vencimento e prazo quando ainda está em dia', () => {
    const texto = buildBillingMessage(base);

    expect(texto).toContain(formatCents(15_000));
    expect(texto).toContain('11/03/2026');
    expect(texto).toContain('15/03/2026');
  });

  it('muda o tom e soma as parcelas quando está vencida', () => {
    const texto = buildBillingMessage({
      ...base,
      overdue: true,
      openInstallments: 2,
      totalOpenCents: 30_000,
    });

    expect(texto).toContain('2 mensalidades em aberto');
    expect(texto).toContain(formatCents(30_000));
  });

  it('usa o singular quando há uma só parcela vencida', () => {
    const texto = buildBillingMessage({ ...base, overdue: true });

    expect(texto).toContain('a mensalidade de ' + formatCents(15_000));
    expect(texto).not.toContain('mensalidades em aberto');
  });

  it('inclui a chave Pix quando houver', () => {
    expect(buildBillingMessage(base)).toContain('Chave Pix: 51981691373');
  });

  it('omite a linha do Pix quando a chave não está configurada', () => {
    const texto = buildBillingMessage({ ...base, pixKey: '   ' });

    expect(texto).not.toContain('Chave Pix');
    expect(texto).toContain('Manda o comprovante por aqui');
  });

  it('assina com o nome da academia', () => {
    expect(buildBillingMessage(base)).toContain('Sabino Academia');
  });

  it('não vaza o nome completo do aluno', () => {
    // A mensagem vai para o próprio aluno, mas o professor costuma mostrar a
    // tela na recepção; o primeiro nome basta.
    expect(buildBillingMessage(base)).not.toContain('Figueiredo');
  });
});

describe('whatsappLinkTo', () => {
  it('monta o link com a mensagem codificada', () => {
    const link = whatsappLinkTo('(51) 98169-1373', 'Olá, Ana!');

    expect(link).toBe('https://wa.me/5551981691373?text=Ol%C3%A1%2C%20Ana!');
  });

  it('devolve null com telefone inutilizável', () => {
    expect(whatsappLinkTo('123', 'oi')).toBeNull();
  });

  it('sobrevive a quebras de linha e acentos da mensagem real', () => {
    const texto = buildBillingMessage(base);
    const link = whatsappLinkTo('51981691373', texto);

    expect(link).not.toBeNull();
    expect(link).toContain('wa.me/5551981691373');
    expect(decodeURIComponent(link?.split('text=')[1] ?? '')).toBe(texto);
  });
});
