import { describe, expect, it } from 'vitest';

import {
  CHECKIN_EARLY_MINUTES,
  CHECKIN_LATE_MINUTES,
  findNextClass,
  findOpenClasses,
  formatMinutes,
  groupAssignedByWeekday,
  type ScheduledClass,
} from './attendanceEngine';
import { isValidCpf, maskCpf, onlyDigits } from './cpf';

/** Horário cheio em São Paulo (UTC-3). */
const sp = (isoDate: string, time: string): Date =>
  new Date(`${isoDate}T${time}:00-03:00`);

/** Recorte da grade real da academia. */
const grade: ScheduledClass[] = [
  { id: 'seg-1830-kids', weekday: 1, startTime: '18:30', endTime: '19:30', title: 'Jiu-Jitsu Kids', level: '4 a 8 anos' },
  { id: 'seg-1930-mma', weekday: 1, startTime: '19:30', endTime: '20:30', title: 'MMA', level: 'Todos os níveis' },
  { id: 'seg-2030-jj', weekday: 1, startTime: '20:30', endTime: '21:30', title: 'Jiu-Jitsu', level: 'Todos os níveis' },
  { id: 'qua-1930-mma', weekday: 3, startTime: '19:30', endTime: '20:30', title: 'MMA', level: 'Todos os níveis' },
  { id: 'qui-1930-jj-fem', weekday: 4, startTime: '19:30', endTime: '20:30', title: 'Jiu-Jitsu', level: 'Turma feminina' },
];

// 2026-03-02 é uma segunda-feira; 2026-03-04 quarta; 2026-03-05 quinta.
const SEGUNDA = '2026-03-02';
const TERCA = '2026-03-03';
const QUARTA = '2026-03-04';

describe('findOpenClasses', () => {
  const meusIds = ['seg-1930-mma', 'qua-1930-mma'];

  it('não abre nada muito antes da aula', () => {
    expect(findOpenClasses(grade, meusIds, sp(SEGUNDA, '18:30'))).toEqual([]);
  });

  it('abre exatamente 30 minutos antes do início', () => {
    const aberto = findOpenClasses(grade, meusIds, sp(SEGUNDA, '19:00'));

    expect(aberto).toHaveLength(1);
    expect(aberto[0]?.classId).toBe('seg-1930-mma');
    expect(aberto[0]?.minutesUntilStart).toBe(CHECKIN_EARLY_MINUTES);
    expect(aberto[0]?.inProgress).toBe(false);
  });

  it('marca a aula como em andamento durante o treino', () => {
    const aberto = findOpenClasses(grade, meusIds, sp(SEGUNDA, '19:45'));

    expect(aberto[0]?.inProgress).toBe(true);
    expect(aberto[0]?.minutesUntilStart).toBe(-15);
  });

  it('aceita o aluno atrasado até 15 minutos depois do fim', () => {
    expect(findOpenClasses(grade, meusIds, sp(SEGUNDA, '20:45'))).toHaveLength(1);
    expect(findOpenClasses(grade, meusIds, sp(SEGUNDA, '20:46'))).toEqual([]);
  });

  it('respeita a janela de atraso declarada', () => {
    const limite = findOpenClasses(grade, meusIds, sp(SEGUNDA, '20:30'));
    expect(limite[0]?.classId).toBe('seg-1930-mma');
    expect(CHECKIN_LATE_MINUTES).toBe(15);
  });

  it('ignora turmas que não são do aluno', () => {
    // 18:40 seria a janela do Kids, mas o aluno não está matriculado nele.
    expect(findOpenClasses(grade, meusIds, sp(SEGUNDA, '18:40'))).toEqual([]);
  });

  it('não abre nada em dia sem aula do aluno', () => {
    expect(findOpenClasses(grade, meusIds, sp(TERCA, '19:45'))).toEqual([]);
  });

  it('devolve lista vazia para aluno sem turma atribuída', () => {
    expect(findOpenClasses(grade, [], sp(SEGUNDA, '19:45'))).toEqual([]);
  });

  it('ordena pela aula mais próxima quando duas janelas se sobrepõem', () => {
    // 20:35: MMA acabou às 20:30 (tolerância) e o Jiu-Jitsu começou às 20:30.
    const aberto = findOpenClasses(
      grade,
      ['seg-1930-mma', 'seg-2030-jj'],
      sp(SEGUNDA, '20:35'),
    );

    expect(aberto).toHaveLength(2);
    expect(aberto[0]?.classId).toBe('seg-2030-jj');
  });
});

describe('findNextClass', () => {
  const meusIds = ['seg-1930-mma', 'qua-1930-mma'];

  it('aponta a aula de hoje que ainda vai começar', () => {
    const proxima = findNextClass(grade, meusIds, sp(SEGUNDA, '08:00'));

    expect(proxima?.classId).toBe('seg-1930-mma');
    expect(proxima?.daysUntil).toBe(0);
    expect(proxima?.minutesUntilStart).toBe(11 * 60 + 30);
  });

  it('considera como próxima a aula que já está em andamento', () => {
    const proxima = findNextClass(grade, meusIds, sp(SEGUNDA, '19:45'));

    expect(proxima?.classId).toBe('seg-1930-mma');
    expect(proxima?.minutesUntilStart).toBe(0);
  });

  it('pula para o próximo dia quando a aula de hoje já terminou', () => {
    const proxima = findNextClass(grade, meusIds, sp(SEGUNDA, '21:00'));

    expect(proxima?.classId).toBe('qua-1930-mma');
    expect(proxima?.daysUntil).toBe(2);
  });

  it('dá a volta na semana quando não há mais aulas à frente', () => {
    const proxima = findNextClass(grade, ['seg-1930-mma'], sp(QUARTA, '10:00'));

    expect(proxima?.classId).toBe('seg-1930-mma');
    expect(proxima?.daysUntil).toBe(5);
  });

  it('devolve null para aluno sem turma', () => {
    expect(findNextClass(grade, [], sp(SEGUNDA, '10:00'))).toBeNull();
  });
});

describe('groupAssignedByWeekday', () => {
  it('agrupa e ordena as turmas do aluno', () => {
    const grupos = groupAssignedByWeekday(grade, ['seg-2030-jj', 'seg-1930-mma', 'qua-1930-mma']);

    expect(grupos.map((g) => g.weekday)).toEqual([1, 3]);
    expect(grupos[0]?.classes.map((c) => c.startTime)).toEqual(['19:30', '20:30']);
  });

  it('devolve vazio sem turmas atribuídas', () => {
    expect(groupAssignedByWeekday(grade, [])).toEqual([]);
  });
});

describe('formatMinutes', () => {
  it('formata a contagem até a próxima aula', () => {
    expect(formatMinutes(45)).toBe('45min');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(95)).toBe('1h35');
    expect(formatMinutes(0)).toBe('0min');
    expect(formatMinutes(-10)).toBe('0min');
  });
});

describe('validação de CPF', () => {
  it('aceita CPFs com dígitos verificadores corretos', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('111.444.777-35')).toBe(true);
  });

  it('rejeita dígito verificador errado', () => {
    expect(isValidCpf('529.982.247-26')).toBe(false);
    expect(isValidCpf('111.444.777-30')).toBe(false);
  });

  it('rejeita sequências repetidas', () => {
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('00000000000')).toBe(false);
  });

  it('rejeita tamanho inválido', () => {
    expect(isValidCpf('')).toBe(false);
    expect(isValidCpf('123')).toBe(false);
    expect(isValidCpf('529982247250')).toBe(false);
  });

  it('mascara deixando apenas os dois últimos dígitos', () => {
    expect(maskCpf('52998224725')).toBe('•••.•••.•••-25');
    expect(maskCpf('invalido')).toBe('•••.•••.•••-••');
  });

  it('extrai apenas dígitos', () => {
    expect(onlyDigits('529.982.247-25')).toBe('52998224725');
  });
});
