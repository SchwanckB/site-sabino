import { describe, expect, it } from 'vitest';

import {
  listAgeTransitions,
  listBirthdays,
  shortName,
  type PersonLike,
} from './roster';

const now = new Date('2026-03-10T12:00:00-03:00');

const pessoas: PersonLike[] = [
  { id: '1', name: 'Ana Clara Figueiredo', birthDate: '2017-03-10' },
  { id: '2', name: 'Bruno Lima', birthDate: '2015-03-25' },
  { id: '3', name: 'Clara Souza', birthDate: '2019-03-02' },
  { id: '4', name: 'Davi Rocha', birthDate: '2013-07-07' },
  { id: '5', name: 'Eduarda Dias', birthDate: '2020-02-29' },
];

describe('listBirthdays', () => {
  it('lista só quem faz aniversário no mês pedido', () => {
    const marco = listBirthdays(pessoas, 2026, 3, now);
    expect(marco.map((b) => b.id)).toEqual(['3', '1', '2']);
  });

  it('ordena por dia do mês', () => {
    const marco = listBirthdays(pessoas, 2026, 3, now);
    expect(marco.map((b) => b.day)).toEqual([2, 10, 25]);
  });

  it('marca o aniversariante do dia', () => {
    const marco = listBirthdays(pessoas, 2026, 3, now);
    const hoje = marco.filter((b) => b.isToday);

    expect(hoje).toHaveLength(1);
    expect(hoje[0]?.name).toBe('Ana Clara Figueiredo');
  });

  it('marca quem já passou neste mês', () => {
    const marco = listBirthdays(pessoas, 2026, 3, now);
    expect(marco.find((b) => b.id === '3')?.isPast).toBe(true);
    expect(marco.find((b) => b.id === '2')?.isPast).toBe(false);
    // O próprio dia não conta como passado.
    expect(marco.find((b) => b.id === '1')?.isPast).toBe(false);
  });

  it('calcula a idade que a pessoa completa', () => {
    const marco = listBirthdays(pessoas, 2026, 3, now);
    expect(marco.find((b) => b.id === '1')?.turning).toBe(9);
    expect(marco.find((b) => b.id === '2')?.turning).toBe(11);
  });

  it('puxa 29 de fevereiro para o dia 28 em ano comum', () => {
    const comum = listBirthdays(pessoas, 2026, 2, now);
    expect(comum.find((b) => b.id === '5')?.day).toBe(28);
    expect(comum.find((b) => b.id === '5')?.date).toBe('2026-02-28');

    const bissexto = listBirthdays(pessoas, 2028, 2, now);
    expect(bissexto.find((b) => b.id === '5')?.day).toBe(29);
  });

  it('devolve lista vazia em mês sem aniversariante', () => {
    expect(listBirthdays(pessoas, 2026, 1, now)).toEqual([]);
  });
});

describe('listAgeTransitions', () => {
  it('avisa de quem faz 16 dentro da janela', () => {
    // Faz 16 em 25/04/2026, 46 dias depois de 10/03.
    const quase: PersonLike[] = [{ id: 'a', name: 'João', birthDate: '2010-04-25' }];
    const lista = listAgeTransitions(quase, now);

    expect(lista).toHaveLength(1);
    expect(lista[0]?.date).toBe('2026-04-25');
    expect(lista[0]?.daysUntil).toBe(46);
    expect(lista[0]?.overdue).toBe(false);
  });

  it('ignora quem faz 16 depois da janela', () => {
    const longe: PersonLike[] = [{ id: 'a', name: 'João', birthDate: '2010-12-25' }];
    expect(listAgeTransitions(longe, now)).toEqual([]);
  });

  it('marca como atrasado quem já tem 16 e continua na lista infantil', () => {
    const passou: PersonLike[] = [{ id: 'a', name: 'Maria', birthDate: '2009-01-15' }];
    const lista = listAgeTransitions(passou, now);

    expect(lista[0]?.overdue).toBe(true);
    expect(lista[0]?.daysUntil).toBeLessThan(0);
  });

  it('põe os atrasados antes dos futuros', () => {
    const mix: PersonLike[] = [
      { id: 'futuro', name: 'Futuro', birthDate: '2010-04-25' },
      { id: 'atrasado', name: 'Atrasado', birthDate: '2009-01-15' },
    ];
    expect(listAgeTransitions(mix, now).map((t) => t.id)).toEqual(['atrasado', 'futuro']);
  });

  it('ordena os futuros do mais próximo ao mais distante', () => {
    const dois: PersonLike[] = [
      { id: 'depois', name: 'Depois', birthDate: '2010-05-01' },
      { id: 'antes', name: 'Antes', birthDate: '2010-03-20' },
    ];
    expect(listAgeTransitions(dois, now).map((t) => t.id)).toEqual(['antes', 'depois']);
  });

  it('inclui quem faz 16 exatamente hoje', () => {
    const hoje: PersonLike[] = [{ id: 'a', name: 'Hoje', birthDate: '2010-03-10' }];
    const lista = listAgeTransitions(hoje, now);

    expect(lista).toHaveLength(1);
    expect(lista[0]?.overdue).toBe(true);
    expect(lista[0]?.daysUntil).toBe(0);
  });

  it('respeita uma janela customizada', () => {
    const pessoa: PersonLike[] = [{ id: 'a', name: 'João', birthDate: '2010-04-25' }];
    expect(listAgeTransitions(pessoa, now, 30)).toEqual([]);
    expect(listAgeTransitions(pessoa, now, 60)).toHaveLength(1);
  });

  it('trata 29 de fevereiro sem inventar 30 de fevereiro', () => {
    const bissexto: PersonLike[] = [{ id: 'a', name: 'Leap', birthDate: '2010-02-29' }];
    // 2010 não é bissexto, mas a data pode existir no cadastro; 2026 também não.
    const lista = listAgeTransitions(bissexto, now, 400);
    expect(lista[0]?.date).toBe('2026-02-28');
  });
});

describe('shortName', () => {
  it('reduz ao primeiro nome mais a inicial do sobrenome', () => {
    expect(shortName('Ana Clara Figueiredo Sabino')).toBe('Ana S.');
    expect(shortName('Bruno Lima')).toBe('Bruno L.');
  });

  it('devolve o nome único sem inventar inicial', () => {
    expect(shortName('Madonna')).toBe('Madonna');
  });

  it('aguenta espaços sobrando e entrada vazia', () => {
    expect(shortName('  João   Vitor  Krause  ')).toBe('João K.');
    expect(shortName('   ')).toBe('');
  });
});
