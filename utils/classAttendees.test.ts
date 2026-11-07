import { describe, expect, it } from 'vitest';

import { attendeesOf, belongsToClass, classesForStudent } from './classAttendees';

/**
 * A regra de quem entra numa aula, dos dois lados.
 *
 * Estava escrita à mão em quatro telas como `classIds.includes`, e a turma
 * avulsa a tornou falsa num caso. Regra duplicada é regra corrigida num lugar
 * só — por isso ela mora aqui, e por isso é testada aqui.
 */

const turmaDaGrade = { id: 'seg-2030-jj', unit: 'tres-cachoeiras' };
const avulsa = { id: 'avulsa-2026-03-07-0900', unit: 'tres-cachoeiras', openToAll: true };
const avulsaDaOutra = { id: 'avulsa-outra', unit: 'terra-de-areia', openToAll: true };

const matriculado = { unit: 'tres-cachoeiras', classIds: ['seg-2030-jj'] };
const semTurma = { unit: 'tres-cachoeiras', classIds: [] };
const deOutraUnidade = { unit: 'terra-de-areia', classIds: [] };

describe('belongsToClass', () => {
  it('na grade normal, vale a matrícula', () => {
    expect(belongsToClass(matriculado, turmaDaGrade)).toBe(true);
    expect(belongsToClass(semTurma, turmaDaGrade)).toBe(false);
  });

  /*
   * O pedido: "quem for marca presença sem precisar pôr na ficha de cada um".
   * A turma avulsa não existe na grade, então não há matrícula para conferir.
   */
  it('na turma avulsa, vale a academia — a ficha não importa', () => {
    expect(belongsToClass(matriculado, avulsa)).toBe(true);
    expect(belongsToClass(semTurma, avulsa)).toBe(true);
  });

  /*
   * O que a abertura **não** afrouxa. Sem esta linha, o aluno de Terra de
   * Areia via o treino aberto de Três Cachoeiras na lista de check-in.
   */
  it('a turma avulsa não atravessa a academia', () => {
    expect(belongsToClass(deOutraUnidade, avulsa)).toBe(false);
    expect(belongsToClass(matriculado, avulsaDaOutra)).toBe(false);
  });
});

describe('attendeesOf', () => {
  const turma = [matriculado, semTurma, deOutraUnidade];

  it('a chamada da grade é a dos matriculados', () => {
    expect(attendeesOf(turma, turmaDaGrade)).toEqual([matriculado]);
  });

  it('a chamada da avulsa é a academia da unidade inteira', () => {
    expect(attendeesOf(turma, avulsa)).toEqual([matriculado, semTurma]);
  });
});

describe('classesForStudent', () => {
  const grade = [turmaDaGrade, avulsa, avulsaDaOutra];

  it('o aluno vê a turma dele e a aberta da academia dele', () => {
    expect(classesForStudent(grade, matriculado).map((c) => c.id)).toEqual([
      'seg-2030-jj',
      'avulsa-2026-03-07-0900',
    ]);
  });

  /*
   * Quem não tem turma nenhuma ainda vê a aberta — é por ela que o aluno
   * novo, ou o que está entre turmas, descobre o treino de sábado.
   */
  it('quem não tem turma na ficha ainda vê a aberta', () => {
    expect(classesForStudent(grade, semTurma).map((c) => c.id)).toEqual([
      'avulsa-2026-03-07-0900',
    ]);
  });

  it('a aberta da outra academia não entra', () => {
    expect(classesForStudent(grade, deOutraUnidade).map((c) => c.id)).toEqual(['avulsa-outra']);
  });
});
