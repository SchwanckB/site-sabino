import { describe, expect, it } from 'vitest';

import { summarizeStreak } from './attendanceStreak';

/**
 * A sequência é o número do perfil que mais convida a mentira.
 *
 * Dias seguidos morreria toda terça numa grade de duas aulas por semana.
 * Semanas seguidas é o que o aluno reconhece como constância — e o que este
 * arquivo trava é justamente onde a semana começa e quando ela quebra.
 */

// 2026-03-02 é segunda; 2026-03-08, o domingo da mesma semana.
const SEGUNDA = '2026-03-02';
const QUARTA = '2026-03-04';
const DOMINGO = '2026-03-08';
const SEGUNDA_SEGUINTE = '2026-03-09';

describe('summarizeStreak', () => {
  it('sem treino, sequência zero', () => {
    expect(summarizeStreak([], SEGUNDA)).toEqual({ weeks: 0, best: 0, thisWeek: false });
  });

  it('um treino nesta semana é uma semana', () => {
    const resumo = summarizeStreak([QUARTA], DOMINGO);
    expect(resumo.weeks).toBe(1);
    expect(resumo.thisWeek).toBe(true);
  });

  it('domingo é a mesma semana da segunda anterior', () => {
    // O erro clássico seria contar domingo como semana nova e dobrar a conta.
    const resumo = summarizeStreak([SEGUNDA, DOMINGO], DOMINGO);
    expect(resumo.weeks).toBe(1);
  });

  it('duas aulas no mesmo dia são uma semana', () => {
    // Presença é por aula realizada: quem treina MMA e jiu na mesma noite tem
    // duas presenças. Constância é outra coisa.
    const resumo = summarizeStreak([QUARTA, QUARTA], QUARTA);
    expect(resumo.weeks).toBe(1);
  });

  it('semanas encadeadas somam', () => {
    const datas = ['2026-02-10', '2026-02-17', '2026-02-24', SEGUNDA];
    expect(summarizeStreak(datas, QUARTA).weeks).toBe(4);
  });

  it('a semana que acabou de começar não quebra a sequência', () => {
    /*
     * Segunda de manhã: ninguém treinou ainda. Zerar aqui a sequência de quem
     * tem quatro semanas seguidas é o tipo de número que faz o aluno fechar a
     * tela — e ele não faltou a nada.
     */
    const datas = ['2026-02-10', '2026-02-17', '2026-02-24', SEGUNDA];
    const resumo = summarizeStreak(datas, SEGUNDA_SEGUINTE);

    expect(resumo.weeks).toBe(4);
    expect(resumo.thisWeek).toBe(false);
  });

  it('uma semana inteira em branco quebra', () => {
    const datas = ['2026-02-10', '2026-02-17', '2026-02-24', SEGUNDA];
    // 2026-03-16 é duas semanas depois de 2026-03-02: a de 09 passou em branco.
    expect(summarizeStreak(datas, '2026-03-16').weeks).toBe(0);
  });

  it('guarda o recorde mesmo depois de quebrar', () => {
    const datas = [
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
      '2026-01-26',
      // fevereiro inteiro em branco
      SEGUNDA,
    ];
    const resumo = summarizeStreak(datas, QUARTA);

    expect(resumo.weeks).toBe(1);
    expect(resumo.best).toBe(4);
  });

  it('o recorde nunca é menor que a sequência atual', () => {
    const datas = ['2026-02-23', SEGUNDA];
    const resumo = summarizeStreak(datas, QUARTA);
    expect(resumo.best).toBeGreaterThanOrEqual(resumo.weeks);
  });

  it('aceita datas fora de ordem e ISO completo', () => {
    const datas = ['2026-03-04T22:30:00.000Z', '2026-02-25', '2026-02-18'];
    expect(summarizeStreak(datas, QUARTA).weeks).toBe(3);
  });

  it('a virada de ano não quebra', () => {
    // 2025-12-29 é segunda; 2026-01-05, a segunda seguinte.
    const resumo = summarizeStreak(['2025-12-29', '2026-01-05'], '2026-01-07');
    expect(resumo.weeks).toBe(2);
  });
});
