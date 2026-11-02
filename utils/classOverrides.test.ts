import { describe, expect, it } from 'vitest';

import type { ClassSlot } from '@/data/seed';

import { applyClassOverrides, recurringOnly, type ClassOverrideTimes } from './classOverrides';
import { findNextClass, findOpenClasses } from './attendanceEngine';

/** Horário cheio em São Paulo (UTC-3). */
const sp = (isoDate: string, time: string): Date =>
  new Date(`${isoDate}T${time}:00-03:00`);

const turma = (over: Partial<ClassSlot> & Pick<ClassSlot, 'id'>): ClassSlot => ({
  weekday: 1,
  startTime: '19:30',
  endTime: '20:30',
  title: 'MMA',
  modality: 'mma',
  level: 'Todos os níveis',
  unit: 'tres-cachoeiras',
  ...over,
});

// 2026-03-02 é segunda; 2026-03-09, a segunda seguinte.
const SEGUNDA = '2026-03-02';
const OUTRA_SEGUNDA = '2026-03-09';
const SABADO = '2026-03-07';

const grade: ClassSlot[] = [
  turma({ id: 'seg-1930-mma' }),
  turma({ id: 'seg-2030-jj', startTime: '20:30', endTime: '21:30', title: 'Jiu-Jitsu', modality: 'jiu-jitsu' }),
];

/** "Hoje o MMA é 18:30 em vez de 19:30." */
const maisCedo: ClassOverrideTimes = {
  classId: 'seg-1930-mma',
  date: SEGUNDA,
  startTime: '18:30',
  endTime: '19:30',
};

describe('applyClassOverrides', () => {
  it('devolve a grade intacta sem nenhuma exceção', () => {
    expect(applyClassOverrides(grade, [])).toEqual(grade);
  });

  it('mantém o id da turma na ocorrência personalizada', () => {
    // É o que faz a presença entrar no ranking e no relatório daquela turma.
    const efetiva = applyClassOverrides(grade, [maisCedo]);
    const personalizada = efetiva.find((slot) => slot.onlyOnDate === SEGUNDA);

    expect(personalizada?.id).toBe('seg-1930-mma');
    expect(personalizada?.startTime).toBe('18:30');
    expect(personalizada?.endTime).toBe('19:30');
    expect(personalizada?.weekday).toBe(1);
    expect(personalizada?.title).toBe('MMA');
    expect(personalizada?.unit).toBe('tres-cachoeiras');
  });

  it('fura o dia da turma recorrente, e só aquele dia', () => {
    const efetiva = applyClassOverrides(grade, [maisCedo]);
    const recorrente = efetiva.find(
      (slot) => slot.id === 'seg-1930-mma' && slot.onlyOnDate === undefined,
    );

    expect(recorrente?.skipDates).toEqual([SEGUNDA]);
    expect(recorrente?.startTime).toBe('19:30');
  });

  it('não encosta nas outras turmas', () => {
    const efetiva = applyClassOverrides(grade, [maisCedo]);
    const outra = efetiva.find((slot) => slot.id === 'seg-2030-jj');

    expect(outra?.skipDates).toBeUndefined();
    expect(outra?.startTime).toBe('20:30');
  });

  it('calcula o dia da semana a partir da data, para outro dia da semana', () => {
    const noSabado = applyClassOverrides(grade, [{ ...maisCedo, date: SABADO }]);
    const personalizada = noSabado.find((slot) => slot.onlyOnDate === SABADO);

    expect(personalizada?.weekday).toBe(6);
  });

  it('ignora exceção de turma que não está mais na grade', () => {
    const efetiva = applyClassOverrides(grade, [{ ...maisCedo, classId: 'turma-apagada' }]);

    expect(efetiva).toEqual(grade);
  });
});

describe('recurringOnly', () => {
  it('tira as ocorrências de data única', () => {
    const efetiva = applyClassOverrides(grade, [maisCedo]);

    expect(recurringOnly(efetiva).map((slot) => slot.id)).toEqual([
      'seg-1930-mma',
      'seg-2030-jj',
    ]);
  });
});

/**
 * O que o aluno vive: no dia da exceção o check-in vale no horário novo, e
 * **não** vale no normal. Nos outros dias, nada muda.
 */
describe('check-in no dia da aula personalizada', () => {
  const efetiva = applyClassOverrides(grade, [maisCedo]);
  const meusIds = ['seg-1930-mma'];

  it('abre uma hora antes do horário personalizado', () => {
    // 17:30 é uma hora antes das 18:30. No horário normal nem teria janela.
    const aberto = findOpenClasses(efetiva, meusIds, sp(SEGUNDA, '17:30'));

    expect(aberto).toHaveLength(1);
    expect(aberto[0]?.startTime).toBe('18:30');
  });

  it('registra presença durante a aula personalizada', () => {
    const aberto = findOpenClasses(efetiva, meusIds, sp(SEGUNDA, '18:45'));

    expect(aberto[0]?.classId).toBe('seg-1930-mma');
    expect(aberto[0]?.inProgress).toBe(true);
  });

  it('não aceita presença no horário normal do dia remarcado', () => {
    // 20:00 estaria no meio do MMA das 19:30 — que hoje não vai acontecer.
    // A única janela que sobra é a da aula personalizada, encerrada às 19:45.
    expect(findOpenClasses(efetiva, meusIds, sp(SEGUNDA, '20:00'))).toEqual([]);
  });

  it('não duplica a turma na janela compartilhada', () => {
    // 18:30: a aula personalizada começou e o horário normal abriria a janela
    // de uma hora. A turma precisa aparecer uma vez, no horário de hoje.
    const aberto = findOpenClasses(efetiva, meusIds, sp(SEGUNDA, '18:30'));

    expect(aberto).toHaveLength(1);
    expect(aberto[0]?.startTime).toBe('18:30');
  });

  it('volta ao horário normal na semana seguinte', () => {
    expect(findOpenClasses(efetiva, meusIds, sp(OUTRA_SEGUNDA, '17:30'))).toEqual([]);

    const aberto = findOpenClasses(efetiva, meusIds, sp(OUTRA_SEGUNDA, '19:45'));
    expect(aberto[0]?.startTime).toBe('19:30');
  });
});

describe('próxima aula com aula personalizada', () => {
  const efetiva = applyClassOverrides(grade, [maisCedo]);
  const meusIds = ['seg-1930-mma'];

  it('anuncia o horário personalizado, marcado como especial', () => {
    const proxima = findNextClass(efetiva, meusIds, sp(SEGUNDA, '08:00'));

    expect(proxima?.startTime).toBe('18:30');
    expect(proxima?.daysUntil).toBe(0);
    expect(proxima?.custom).toBe(true);
  });

  it('não anuncia o horário normal do dia que foi remarcado', () => {
    // 19:00: a aula personalizada está rolando. O horário normal das 19:30
    // não existe hoje e não pode aparecer como "começa em 30min".
    const proxima = findNextClass(efetiva, meusIds, sp(SEGUNDA, '19:00'));

    expect(proxima?.startTime).toBe('18:30');
    expect(proxima?.minutesUntilStart).toBe(0);
  });

  it('pula para a semana seguinte quando a personalizada já terminou', () => {
    const proxima = findNextClass(efetiva, meusIds, sp(SEGUNDA, '21:00'));

    expect(proxima?.startTime).toBe('19:30');
    expect(proxima?.daysUntil).toBe(7);
    expect(proxima?.custom).toBe(false);
  });

  it('pula a ocorrência remarcada quando ela é a da semana que vem', () => {
    const futura = applyClassOverrides(grade, [{ ...maisCedo, date: OUTRA_SEGUNDA }]);
    // Terça, 2026-03-03: a próxima segunda é 09/03, que foi remarcada.
    const proxima = findNextClass(futura, meusIds, sp('2026-03-03', '10:00'));

    expect(proxima?.startTime).toBe('18:30');
    expect(proxima?.custom).toBe(true);
    expect(proxima?.daysUntil).toBe(6);
  });
});
