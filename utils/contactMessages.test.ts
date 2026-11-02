import { describe, expect, it } from 'vitest';

import { buildBirthdayMessage, buildComebackMessage } from './contactMessages';

const ACADEMIA = 'Sabino Academia';

describe('buildBirthdayMessage', () => {
  it('fala com o aluno pelo primeiro nome', () => {
    const texto = buildBirthdayMessage({
      name: 'Bernardo Schwanck Souza',
      turning: 30,
      academyName: ACADEMIA,
    });

    expect(texto).toContain('Parabéns, Bernardo!');
    expect(texto).toContain('30 anos');
    expect(texto).toContain(ACADEMIA);
    // Não é a mensagem do responsável.
    expect(texto).not.toContain('aniversário do');
  });

  it('fala com o responsável quando a criança não tem telefone', () => {
    const texto = buildBirthdayMessage({
      name: 'Pedro Henrique',
      turning: 7,
      academyName: ACADEMIA,
      toGuardian: true,
      guardianName: 'Maria Silva',
    });

    expect(texto).toContain('Olá, Maria!');
    expect(texto).toContain('aniversário do Pedro');
    expect(texto).toContain('7 anos');
  });

  it('não quebra sem o nome do responsável', () => {
    const texto = buildBirthdayMessage({
      name: 'Pedro',
      turning: 7,
      academyName: ACADEMIA,
      toGuardian: true,
    });

    expect(texto.startsWith('Olá!')).toBe(true);
    expect(texto).toContain('aniversário do Pedro');
  });
});

describe('buildComebackMessage', () => {
  it('convida sem citar quantos dias faltou', () => {
    const texto = buildComebackMessage({
      name: 'Carlos Eduardo',
      daysAway: 47,
      academyName: ACADEMIA,
    });

    expect(texto).toContain('Olá, Carlos!');
    expect(texto).toContain('Senti sua falta');
    // O número de dias constrange e não ajuda a trazer ninguém de volta.
    expect(texto).not.toContain('47');
  });

  it('usa o horário da turma quando ele é conhecido', () => {
    const texto = buildComebackMessage({
      name: 'Carlos',
      daysAway: 30,
      academyName: ACADEMIA,
      classHint: 'segunda e quarta às 19:30',
    });

    expect(texto).toContain('segunda e quarta às 19:30');
    expect(texto).not.toContain('A porta está aberta quando você quiser');
  });

  it('trata quem se matriculou e nunca apareceu', () => {
    const texto = buildComebackMessage({
      name: 'Ana Paula',
      daysAway: null,
      academyName: ACADEMIA,
    });

    expect(texto).toContain('ainda não apareceu');
    expect(texto).not.toContain('Senti sua falta');
  });
});
