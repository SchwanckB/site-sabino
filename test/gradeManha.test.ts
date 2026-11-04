import { describe, expect, it } from 'vitest';

import { seedSchedule, type ClassSlot } from '@/data/seed';
import {
  CHECKIN_EARLY_MINUTES,
  findNextClass,
  findOpenClasses,
  occursOnDate,
} from '@/utils/attendanceEngine';

/**
 * A turma da manhã.
 *
 * Jiu-jitsu às terças e quintas, 06h às 07h, em Três Cachoeiras. Toda a grade
 * vivia entre 18h30 e 21h30, e vários textos do site afirmavam isso — a turma
 * da manhã é o primeiro horário que quebra a suposição, e por isso ganha teste
 * próprio: a janela de check-in dela cai antes das 6h, onde erro de fuso e de
 * virada de dia aparece primeiro.
 */

/** Horário cheio em São Paulo (UTC-3, sem horário de verão desde 2019). */
const sp = (isoDate: string, time: string): Date => new Date(`${isoDate}T${time}:00-03:00`);

// 2026-03-03 é terça; 2026-03-05 é quinta; 2026-03-04 é quarta.
const TERCA = '2026-03-03';
const QUARTA = '2026-03-04';
const QUINTA = '2026-03-05';

const manha: readonly ClassSlot[] = seedSchedule.classes.filter(
  (slot) => slot.startTime === '06:00',
);

const meusIds = manha.map((slot) => slot.id);

describe('grade da manhã no seed', () => {
  it('são duas turmas: terça e quinta', () => {
    expect(manha).toHaveLength(2);
    expect(manha.map((slot) => slot.weekday).sort()).toEqual([2, 4]);
  });

  it('uma hora de aula, de jiu-jitsu, em Três Cachoeiras', () => {
    for (const slot of manha) {
      expect(slot.endTime).toBe('07:00');
      expect(slot.modality).toBe('jiu-jitsu');
      expect(slot.unit).toBe('tres-cachoeiras');
    }
  });

  it('acontece no dia certo da semana, e não nos outros', () => {
    const terca = manha.find((slot) => slot.weekday === 2);
    const quinta = manha.find((slot) => slot.weekday === 4);

    expect(terca && occursOnDate(terca, TERCA)).toBe(true);
    expect(terca && occursOnDate(terca, QUARTA)).toBe(false);
    expect(quinta && occursOnDate(quinta, QUINTA)).toBe(true);
  });

  it('cada id é único na grade inteira', () => {
    const ids = seedSchedule.classes.map((slot) => slot.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/*
 * A janela, do lado do aluno.
 *
 * Ela abre uma hora antes e nada disso é dito ao aluno — é mecânica interna.
 * Para a aula das 6h isso significa 5h da manhã, e é o caso em que um erro de
 * fuso devolveria "nenhuma turma sua está acontecendo agora" a quem chegou
 * meia hora antes do treino.
 */
describe('check-in da turma da manhã', () => {
  it('não abre às 4h59', () => {
    expect(findOpenClasses(manha, meusIds, sp(TERCA, '04:59'))).toEqual([]);
  });

  it('abre em ponto às 5h, uma hora antes', () => {
    const aberto = findOpenClasses(manha, meusIds, sp(TERCA, '05:00'));

    expect(aberto).toHaveLength(1);
    expect(aberto[0]?.startTime).toBe('06:00');
    expect(aberto[0]?.minutesUntilStart).toBe(CHECKIN_EARLY_MINUTES);
    expect(aberto[0]?.inProgress).toBe(false);
  });

  it('aceita quem chega às 5h50 — o caso de quem chega cedo', () => {
    expect(findOpenClasses(manha, meusIds, sp(TERCA, '05:50'))).toHaveLength(1);
  });

  it('está em andamento durante a aula', () => {
    const aberto = findOpenClasses(manha, meusIds, sp(TERCA, '06:20'));
    expect(aberto[0]?.inProgress).toBe(true);
  });

  /*
   * Na turma da manhã a tolerância do fim é o que mais serve: quem treina às
   * 6h sai correndo para o trabalho e lembra do cartaz já no estacionamento.
   */
  it('aceita quem marca depois do treino, até 8h, e nada depois', () => {
    expect(findOpenClasses(manha, meusIds, sp(TERCA, '07:30'))).toHaveLength(1);
    expect(findOpenClasses(manha, meusIds, sp(TERCA, '08:00'))).toHaveLength(1);
    expect(findOpenClasses(manha, meusIds, sp(TERCA, '08:01'))).toEqual([]);
  });

  it('a aula da terça não abre a janela na quarta', () => {
    expect(findOpenClasses(manha, meusIds, sp(QUARTA, '05:30'))).toEqual([]);
  });

  /*
   * O horário em que o erro de fuso apareceria.
   *
   * Às 23h de segunda em São Paulo já é terça em UTC. Um cálculo feito no dia
   * UTC abriria a janela da terça quase sete horas antes da hora.
   */
  it('a virada do dia UTC não antecipa a aula da manhã', () => {
    expect(findOpenClasses(manha, meusIds, sp('2026-03-02', '23:30'))).toEqual([]);
  });
});

describe('próxima aula do aluno da manhã', () => {
  it('na quarta, a próxima é a quinta às 06:00', () => {
    const proxima = findNextClass(manha, meusIds, sp(QUARTA, '09:00'));

    expect(proxima?.weekday).toBe(4);
    expect(proxima?.startTime).toBe('06:00');
    expect(proxima?.daysUntil).toBe(1);
  });

  it('depois da aula de terça, a próxima é a quinta, não a terça seguinte', () => {
    const proxima = findNextClass(manha, meusIds, sp(TERCA, '08:00'));

    expect(proxima?.weekday).toBe(4);
    expect(proxima?.daysUntil).toBe(2);
  });

  it('às 5h da terça, a aula de hoje ainda é a próxima', () => {
    const proxima = findNextClass(manha, meusIds, sp(TERCA, '05:00'));

    expect(proxima?.daysUntil).toBe(0);
    expect(proxima?.minutesUntilStart).toBe(60);
  });
});
