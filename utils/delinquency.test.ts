import { describe, expect, it } from 'vitest';

import {
  delinquencyOverview,
  recoveryReport,
  studentDelinquency,
  type PaidInstallment,
} from './delinquency';

const pago = (paidOn: string, dueDate: string): PaidInstallment => ({ paidOn, dueDate });

describe('studentDelinquency', () => {
  it('não acusa atraso em quem paga em dia ou antes', () => {
    const perfil = studentDelinquency('a', [
      pago('2026-03-10', '2026-03-10'),
      pago('2026-02-08', '2026-02-10'),
    ]);

    expect(perfil.lateCount).toBe(0);
    expect(perfil.averageDelayDays).toBeNull();
    expect(perfil.worstDelayDays).toBe(0);
    expect(perfil.chronic).toBe(false);
  });

  it('calcula a média só entre os pagamentos atrasados', () => {
    const perfil = studentDelinquency('a', [
      pago('2026-03-20', '2026-03-10'), // 10 dias
      pago('2026-02-14', '2026-02-10'), // 4 dias
      pago('2026-01-10', '2026-01-10'), // em dia
    ]);

    // Média de 10 e 4 — o pagamento em dia não puxa para baixo.
    expect(perfil.averageDelayDays).toBe(7);
    expect(perfil.worstDelayDays).toBe(10);
    expect(perfil.lateCount).toBe(2);
    expect(perfil.measured).toBe(3);
  });

  it('quem atrasou uma vez em duas não é mau pagador', () => {
    // Sem piso de histórico, todo aluno novo que esquece o primeiro
    // vencimento entraria na lista de problema.
    const perfil = studentDelinquency('a', [
      pago('2026-03-20', '2026-03-10'),
      pago('2026-02-10', '2026-02-10'),
    ]);

    expect(perfil.chronic).toBe(false);
  });

  it('reconhece o hábito quando há histórico', () => {
    const perfil = studentDelinquency('a', [
      pago('2026-03-20', '2026-03-10'),
      pago('2026-02-18', '2026-02-10'),
      pago('2026-01-15', '2026-01-10'),
    ]);

    expect(perfil.chronic).toBe(true);
  });

  it('ignora pagamento antigo sem vencimento gravado', () => {
    // Entrar com atraso zero faria a academia parecer mais pontual do que é.
    const perfil = studentDelinquency('a', [
      pago('2026-03-20', ''),
      pago('2026-02-14', '2026-02-10'),
    ]);

    expect(perfil.measured).toBe(1);
    expect(perfil.averageDelayDays).toBe(4);
  });

  it('aluno sem histórico não vira estatística', () => {
    const perfil = studentDelinquency('a', []);

    expect(perfil.measured).toBe(0);
    expect(perfil.chronic).toBe(false);
    expect(perfil.averageDelayDays).toBeNull();
  });
});

describe('delinquencyOverview', () => {
  it('pondera pelo número de atrasos, não pela média das médias', () => {
    const perfis = [
      // Um atraso de 30 dias.
      studentDelinquency('a', [pago('2026-04-09', '2026-03-10')]),
      studentDelinquency('b', [
        pago('2026-03-12', '2026-03-10'),
        pago('2026-02-12', '2026-02-10'),
        pago('2026-01-12', '2026-01-10'),
      ]),
    ];

    const geral = delinquencyOverview(perfis);

    // Três atrasos de 2 dias e um de 30: a média ponderada é 9, e a média
    // das médias daria 16 — número que ninguém reconheceria.
    expect(geral.averageDelayDays).toBe(9);
    expect(geral.measuredPayments).toBe(4);
  });

  it('calcula a proporção de pagamentos em dia', () => {
    const perfis = [
      studentDelinquency('a', [pago('2026-03-10', '2026-03-10')]),
      studentDelinquency('b', [
        pago('2026-03-20', '2026-03-10'),
        pago('2026-02-10', '2026-02-10'),
      ]),
    ];

    // Dois de três em dia.
    expect(delinquencyOverview(perfis).onTimePercent).toBe(67);
  });

  it('lista os crônicos', () => {
    const perfis = [
      studentDelinquency('pontual', [
        pago('2026-03-10', '2026-03-10'),
        pago('2026-02-10', '2026-02-10'),
        pago('2026-01-10', '2026-01-10'),
      ]),
      studentDelinquency('atrasado', [
        pago('2026-03-20', '2026-03-10'),
        pago('2026-02-18', '2026-02-10'),
        pago('2026-01-15', '2026-01-10'),
      ]),
    ];

    expect(delinquencyOverview(perfis).chronicUserIds).toEqual(['atrasado']);
  });

  it('academia sem histórico não inventa número', () => {
    const geral = delinquencyOverview([]);

    expect(geral.averageDelayDays).toBeNull();
    expect(geral.onTimePercent).toBeNull();
  });
});

describe('recoveryReport', () => {
  it('conta quem pagou na semana seguinte à cobrança', () => {
    const relatorio = recoveryReport([
      { userId: 'a', chargedOn: '2026-03-10', lastPaidOn: '2026-03-12' },
      { userId: 'b', chargedOn: '2026-03-10', lastPaidOn: '2026-03-25' },
      { userId: 'c', chargedOn: '2026-03-10', lastPaidOn: undefined },
    ]);

    expect(relatorio.charged).toBe(3);
    expect(relatorio.recovered).toBe(1);
    expect(relatorio.recoveryPercent).toBe(33);
  });

  it('pagamento anterior à cobrança não conta como recuperação', () => {
    const relatorio = recoveryReport([
      { userId: 'a', chargedOn: '2026-03-10', lastPaidOn: '2026-03-01' },
    ]);

    expect(relatorio.recovered).toBe(0);
  });

  it('quem não foi cobrado fica fora da conta', () => {
    const relatorio = recoveryReport([
      { userId: 'a', chargedOn: undefined, lastPaidOn: '2026-03-12' },
    ]);

    expect(relatorio.charged).toBe(0);
    expect(relatorio.recoveryPercent).toBeNull();
  });
});
