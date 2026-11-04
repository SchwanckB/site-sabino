import { describe, expect, it } from 'vitest';

import { saoPauloDateString, saoPauloTimeString } from './datetime';

/**
 * Defeito real que estes testes travam.
 *
 * O horário da presença era mostrado com `entry.at.slice(11, 16)`, e `at` é o
 * ISO em UTC. O aluno que batia presença às 19h30 lia "check-in às 22:30" no
 * painel, e concluía — com razão — que o sistema tinha registrado na hora
 * errada. O mesmo texto errado aparecia na lista da aula, na chamada do
 * professor e na planilha de presenças.
 */
describe('saoPauloTimeString', () => {
  it('converte o instante UTC para o relógio da academia', () => {
    // 22:30 UTC é 19:30 em São Paulo (UTC-3).
    expect(saoPauloTimeString('2026-03-10T22:30:00.000Z')).toBe('19:30');
  });

  it('não repete o erro de fatiar o ISO', () => {
    const iso = '2026-03-10T22:30:00.000Z';
    expect(saoPauloTimeString(iso)).not.toBe(iso.slice(11, 16));
  });

  it('serve a turma da manhã, que é o caso mais apertado', () => {
    // 09:00 UTC é 06:00 em São Paulo: fatiar o ISO daria "09:00", três horas
    // depois do fim da aula.
    expect(saoPauloTimeString('2026-03-10T09:00:00.000Z')).toBe('06:00');
    expect(saoPauloTimeString('2026-03-10T09:58:00.000Z')).toBe('06:58');
  });

  it('atravessa a meia-noite UTC sem pular de dia nem de hora', () => {
    // 01:15 UTC do dia 11 é 22:15 do dia 10 em São Paulo.
    const instante = '2026-03-11T01:15:00.000Z';
    expect(saoPauloTimeString(instante)).toBe('22:15');
    expect(saoPauloDateString(new Date(instante))).toBe('2026-03-10');
  });

  it('aceita Date e string, com o mesmo resultado', () => {
    const iso = '2026-07-02T23:05:00.000Z';
    expect(saoPauloTimeString(new Date(iso))).toBe(saoPauloTimeString(iso));
    expect(saoPauloTimeString(iso)).toBe('20:05');
  });

  it('zero-padding nas duas casas', () => {
    expect(saoPauloTimeString('2026-03-10T12:04:00.000Z')).toBe('09:04');
  });

  /*
   * Registro torto não derruba a página.
   *
   * O histórico vem do Redis, e um `at` vazio ou corrompido faria
   * `saoPauloParts` lançar — levando embora a lista inteira de presenças por
   * causa de uma linha. A hora é detalhe; a presença não.
   */
  it('instante inválido devolve --:-- em vez de lançar', () => {
    expect(saoPauloTimeString('')).toBe('--:--');
    expect(saoPauloTimeString('ontem à noite')).toBe('--:--');
    expect(saoPauloTimeString(new Date(Number.NaN))).toBe('--:--');
  });
});
