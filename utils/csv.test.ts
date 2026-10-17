import { describe, expect, it } from 'vitest';

import { CSV_BOM, buildCsv, csvCell, csvCents, csvFilename, csvNumber } from './csv';

describe('csvCell', () => {
  it('deixa texto simples como está', () => {
    expect(csvCell('Bruno Lima')).toBe('Bruno Lima');
    expect(csvCell(42)).toBe('42');
  });

  it('trata vazio e nulo como célula vazia', () => {
    expect(csvCell('')).toBe('');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('põe entre aspas o que contém o separador', () => {
    // Uma observação com ponto e vírgula deslocaria todas as colunas.
    expect(csvCell('lesão no joelho; liberado para treino leve')).toBe(
      '"lesão no joelho; liberado para treino leve"',
    );
  });

  it('duplica aspas internas', () => {
    expect(csvCell('o aluno disse "volto semana que vem"')).toBe(
      '"o aluno disse ""volto semana que vem"""',
    );
  });

  it('protege quebra de linha', () => {
    expect(csvCell('linha 1\nlinha 2')).toBe('"linha 1\nlinha 2"');
    expect(csvCell('linha 1\r\nlinha 2')).toBe('"linha 1\r\nlinha 2"');
  });
});

describe('csvNumber e csvCents', () => {
  it('usa vírgula decimal, como a planilha brasileira', () => {
    expect(csvNumber(7.5)).toBe('7,50');
    expect(csvCents(15_000)).toBe('150,00');
    expect(csvCents(0)).toBe('0,00');
  });

  it('respeita as casas pedidas', () => {
    expect(csvNumber(7.456, 1)).toBe('7,5');
    expect(csvNumber(12, 0)).toBe('12');
  });
});

describe('buildCsv', () => {
  const headers = ['Nome', 'Faixa', 'Valor'];
  const rows = [
    ['Ana Clara', 'cinza', '150,00'],
    ['Bruno; o Lima', 'amarela', '150,00'],
  ];

  it('começa com BOM, senão o Excel estraga os acentos', () => {
    expect(buildCsv(headers, rows).startsWith(CSV_BOM)).toBe(true);
  });

  it('separa por ponto e vírgula', () => {
    const linha = buildCsv(headers, []).replace(CSV_BOM, '').split('\r\n')[0];
    expect(linha).toBe('Nome;Faixa;Valor');
  });

  it('escapa as células dos dados', () => {
    const texto = buildCsv(headers, rows);
    expect(texto).toContain('"Bruno; o Lima"');
  });

  it('termina cada linha com CRLF e fecha o arquivo', () => {
    const texto = buildCsv(headers, rows);
    expect(texto.endsWith('\r\n')).toBe(true);
    // Cabeçalho + duas linhas.
    expect(texto.trimEnd().split('\r\n')).toHaveLength(3);
  });

  it('gera só o cabeçalho quando não há linhas', () => {
    expect(buildCsv(headers, []).trimEnd().split('\r\n')).toHaveLength(1);
  });
});

describe('csvFilename', () => {
  it('tira acento e espaço, que quebram o download', () => {
    expect(csvFilename('Alunos — Três Cachoeiras', '2026-10-16')).toBe(
      'alunos-tres-cachoeiras-2026-10-16.csv',
    );
  });

  it('não deixa hífen sobrando nas pontas', () => {
    expect(csvFilename('  Financeiro  ', '2026-01-02')).toBe('financeiro-2026-01-02.csv');
  });
});
