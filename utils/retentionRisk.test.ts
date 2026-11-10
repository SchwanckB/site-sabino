import { describe, expect, it } from 'vitest';

import { assessRetentionRisk } from './retentionRisk';

const HOJE = '2026-06-01';

/** Datas a N dias atrás de HOJE, para os casos se lerem como a regra. */
function diasAtras(...dias: readonly number[]): string[] {
  return dias.map((d) => {
    const base = Date.UTC(2026, 5, 1) - d * 86_400_000;
    return new Date(base).toISOString().slice(0, 10);
  });
}

describe('assessRetentionRisk', () => {
  it('não acusa quem nunca treinou', () => {
    expect(assessRetentionRisk({ dates: [], today: HOJE, paidUp: true }).level).toBe('nenhum');
  });

  it('não acusa quem acabou de entrar: sem base não há queda', () => {
    // Três treinos, todos na janela recente — nada antes para comparar.
    const risk = assessRetentionRisk({
      dates: diasAtras(1, 4, 8),
      today: HOJE,
      paidUp: true,
    });

    expect(risk.level).toBe('nenhum');
  });

  it('não acusa o esporádico que segue esporádico', () => {
    // Uma vez por semana antes, uma vez por semana agora: padrão mantido.
    const risk = assessRetentionRisk({
      dates: diasAtras(3, 10, 17, 24, 31, 38),
      today: HOJE,
      paidUp: true,
    });

    expect(risk.level).toBe('nenhum');
  });

  it('acusa risco alto quem era regular e parou de vez', () => {
    // 12 treinos nas 4 semanas da base, zero nas últimas 2.
    const risk = assessRetentionRisk({
      dates: diasAtras(15, 17, 19, 22, 24, 26, 29, 31, 33, 36, 38, 40),
      today: HOJE,
      paidUp: true,
    });

    expect(risk.level).toBe('alto');
    expect(risk.reason).toContain('não aparece há 15 dias');
    expect(risk.weight).toBeGreaterThan(1000);
  });

  it('acusa atenção na queda pela metade — o caso que o corte de 21 dias perde', () => {
    // 12 treinos na base (3x/semana), só 1 nas últimas 2 semanas.
    const risk = assessRetentionRisk({
      dates: diasAtras(2, 15, 17, 19, 22, 24, 26, 29, 31, 33, 36, 38, 40),
      today: HOJE,
      paidUp: true,
    });

    expect(risk.level).toBe('atencao');
    expect(risk.reason).toContain('caiu de');
    // Treinou há 2 dias: o corte por ausência não o veria de jeito nenhum.
    expect(risk.reason).not.toContain('não aparece');
  });

  it('acusa quem pagou e sumiu, mesmo sem queda de padrão', () => {
    // Frequência estável na comparação, mas 11 dias sem aparecer.
    const risk = assessRetentionRisk({
      dates: diasAtras(11, 12, 16, 20, 24, 30, 34, 40),
      today: HOJE,
      paidUp: true,
    });

    expect(risk.level).toBe('atencao');
    expect(risk.reason).toContain('mensalidade em dia');
  });

  it('não usa o sinal de "pagou e sumiu" para quem está devendo', () => {
    const dates = diasAtras(11, 12, 16, 20, 24, 30, 34, 40);

    expect(assessRetentionRisk({ dates, today: HOJE, paidUp: true }).level).toBe('atencao');
    // Mesma frequência, inadimplente: sumiu por motivo já conhecido.
    expect(assessRetentionRisk({ dates, today: HOJE, paidUp: false }).level).toBe('nenhum');
  });

  it('ordena o que parou de vez acima do que só caiu', () => {
    const parou = assessRetentionRisk({
      dates: diasAtras(15, 17, 19, 22, 24, 26, 29, 31, 33, 36, 38, 40),
      today: HOJE,
      paidUp: true,
    });

    const caiu = assessRetentionRisk({
      dates: diasAtras(2, 15, 17, 19, 22, 24, 26, 29, 31, 33, 36, 38, 40),
      today: HOJE,
      paidUp: true,
    });

    expect(parou.weight).toBeGreaterThan(caiu.weight);
  });

  it('ignora data futura em vez de contá-la como treino de hoje', () => {
    const comFuturo = assessRetentionRisk({
      dates: [...diasAtras(15, 17, 19, 22, 24, 26, 29, 31, 33, 36, 38, 40), '2026-12-25'],
      today: HOJE,
      paidUp: true,
    });

    // Sem o filtro, o treino "de daqui a meses" entraria na janela recente e
    // apagaria o alerta de quem parou.
    expect(comFuturo.level).toBe('alto');
  });

  it('não depende da ordem em que as datas chegam', () => {
    const dias = [15, 17, 19, 22, 24, 26, 29, 31, 33, 36, 38, 40];

    const crescente = assessRetentionRisk({
      dates: diasAtras(...dias),
      today: HOJE,
      paidUp: true,
    });
    const decrescente = assessRetentionRisk({
      dates: diasAtras(...[...dias].reverse()),
      today: HOJE,
      paidUp: true,
    });

    expect(crescente).toEqual(decrescente);
  });
});
