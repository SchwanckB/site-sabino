import { describe, expect, it } from 'vitest';

import { GUARDIAN_AGE, validateOnboarding, type OnboardingInput } from './onboardingValidation';

const now = new Date('2026-10-14T12:00:00-03:00');

/** Cadastro adulto válido; cada teste quebra um campo por vez. */
const base = (overrides: Partial<OnboardingInput> = {}): OnboardingInput => ({
  name: 'Maria da Silva',
  phone: '(51) 99999-8888',
  cpf: '529.982.247-25',
  birthDate: '1995-04-20',
  guardianName: '',
  guardianPhone: '',
  guardianCpf: '',
  gender: 'feminino',
  unit: 'tres-cachoeiras',
  consent: true,
  hasDocument: true,
  documentRequired: true,
  ...overrides,
});

describe('cadastro adulto', () => {
  it('aceita um cadastro completo', () => {
    const result = validateOnboarding(base(), now);

    expect(result.valid).toBe(true);
    expect(result.fieldErrors).toEqual({});
    expect(result.normalized.phone).toBe('51999998888');
    expect(result.normalized.cpf).toBe('52998224725');
    expect(result.normalized.age).toBe(31);
    expect(result.normalized.isMinor).toBe(false);
  });

  it('não guarda dados de responsável para maior de idade', () => {
    const result = validateOnboarding(
      base({ guardianName: 'Alguém', guardianPhone: '51999990000' }),
      now,
    );

    expect(result.valid).toBe(true);
    expect(result.normalized.guardianName).toBeNull();
    expect(result.normalized.guardianPhone).toBeNull();
  });
});

describe('nome', () => {
  it('exige nome com ao menos 3 letras', () => {
    expect(validateOnboarding(base({ name: 'Jo' }), now).fieldErrors['name']).toBeDefined();
    expect(validateOnboarding(base({ name: '   ' }), now).fieldErrors['name']).toBeDefined();
  });
});

describe('telefone', () => {
  it('aceita com e sem máscara', () => {
    expect(validateOnboarding(base({ phone: '5199999888' }), now).valid).toBe(true);
    expect(validateOnboarding(base({ phone: '+55 51 99999-8888' }), now).valid).toBe(true);
  });

  it('rejeita curto ou longo demais', () => {
    expect(validateOnboarding(base({ phone: '99999' }), now).fieldErrors['phone']).toBeDefined();
    expect(
      validateOnboarding(base({ phone: '12345678901234' }), now).fieldErrors['phone'],
    ).toBeDefined();
  });
});

describe('CPF', () => {
  it('rejeita dígito verificador errado', () => {
    expect(validateOnboarding(base({ cpf: '529.982.247-26' }), now).fieldErrors['cpf']).toBeDefined();
  });

  it('rejeita sequência repetida', () => {
    expect(validateOnboarding(base({ cpf: '111.111.111-11' }), now).fieldErrors['cpf']).toBeDefined();
  });
});

describe('data de nascimento', () => {
  it('rejeita data que não existe no calendário', () => {
    // Passa no formato, mas 31 de fevereiro não existe - era por onde entrava
    // lixo no banco.
    expect(validateOnboarding(base({ birthDate: '2010-02-31' }), now).fieldErrors['birthDate']).toBeDefined();
    expect(validateOnboarding(base({ birthDate: '2010-13-01' }), now).fieldErrors['birthDate']).toBeDefined();
    expect(validateOnboarding(base({ birthDate: '2010-00-10' }), now).fieldErrors['birthDate']).toBeDefined();
  });

  it('aceita 29 de fevereiro em ano bissexto', () => {
    expect(validateOnboarding(base({ birthDate: '2008-02-29' }), now).valid).toBe(true);
  });

  it('rejeita formato inválido ou vazio', () => {
    expect(validateOnboarding(base({ birthDate: '' }), now).fieldErrors['birthDate']).toBeDefined();
    expect(validateOnboarding(base({ birthDate: '20/04/1995' }), now).fieldErrors['birthDate']).toBeDefined();
  });

  it('rejeita idade fora da faixa', () => {
    expect(validateOnboarding(base({ birthDate: '2025-01-01' }), now).fieldErrors['birthDate']).toBeDefined();
    expect(validateOnboarding(base({ birthDate: '1850-01-01' }), now).fieldErrors['birthDate']).toBeDefined();
  });

  it('aceita a idade mínima da academia - 4 anos', () => {
    const result = validateOnboarding(
      base({
        birthDate: '2022-05-10',
        guardianName: 'Mãe da Criança',
        guardianPhone: '51999997777',
      }),
      now,
    );

    expect(result.valid).toBe(true);
    expect(result.normalized.age).toBe(4);
    expect(result.normalized.isMinor).toBe(true);
  });
});

describe('responsável para menores', () => {
  const menor = (overrides: Partial<OnboardingInput> = {}): OnboardingInput =>
    base({ birthDate: '2014-03-15', ...overrides });

  it('exige nome e telefone do responsável', () => {
    const result = validateOnboarding(menor(), now);

    expect(result.valid).toBe(false);
    expect(result.fieldErrors['guardianName']).toBeDefined();
    expect(result.fieldErrors['guardianPhone']).toBeDefined();
  });

  it('aceita quando o responsável está preenchido', () => {
    const result = validateOnboarding(
      menor({ guardianName: 'João da Silva', guardianPhone: '(51) 98888-7777' }),
      now,
    );

    expect(result.valid).toBe(true);
    expect(result.normalized.guardianName).toBe('João da Silva');
    expect(result.normalized.guardianPhone).toBe('51988887777');
  });

  it('deixa o CPF do responsável opcional, mas valida se vier', () => {
    const semCpf = validateOnboarding(
      menor({ guardianName: 'João da Silva', guardianPhone: '51988887777' }),
      now,
    );
    expect(semCpf.valid).toBe(true);
    expect(semCpf.normalized.guardianCpf).toBeNull();

    const cpfErrado = validateOnboarding(
      menor({
        guardianName: 'João da Silva',
        guardianPhone: '51988887777',
        guardianCpf: '111.111.111-11',
      }),
      now,
    );
    expect(cpfErrado.fieldErrors['guardianCpf']).toBeDefined();
  });

  it('usa 18 anos como corte', () => {
    const quase = validateOnboarding(base({ birthDate: '2008-10-15' }), now);
    expect(quase.normalized.age).toBe(GUARDIAN_AGE - 1);
    expect(quase.fieldErrors['guardianName']).toBeDefined();

    const maior = validateOnboarding(base({ birthDate: '2008-10-14' }), now);
    expect(maior.normalized.age).toBe(GUARDIAN_AGE);
    expect(maior.valid).toBe(true);
  });

  it('não cobra responsável quando a data é inválida', () => {
    // Sem data confiável não dá para saber se é menor - cobrar responsável
    // aqui só geraria um erro confuso em cima de outro.
    const result = validateOnboarding(base({ birthDate: 'xx' }), now);

    expect(result.fieldErrors['birthDate']).toBeDefined();
    expect(result.fieldErrors['guardianName']).toBeUndefined();
  });
});

describe('consentimento e documento', () => {
  it('exige o aceite de LGPD', () => {
    expect(validateOnboarding(base({ consent: false }), now).fieldErrors['consent']).toBeDefined();
  });

  it('exige documento quando o armazenamento está ligado', () => {
    const result = validateOnboarding(
      base({ hasDocument: false, documentRequired: true }),
      now,
    );
    expect(result.fieldErrors['document']).toBeDefined();
  });

  it('libera o cadastro sem documento quando o Blob não está configurado', () => {
    // Sem essa saída, nenhuma matrícula seria possível antes de criar o Blob.
    const result = validateOnboarding(
      base({ hasDocument: false, documentRequired: false }),
      now,
    );
    expect(result.valid).toBe(true);
  });
});

describe('acúmulo de erros', () => {
  it('devolve todos os problemas de uma vez', () => {
    const result = validateOnboarding(
      base({ name: '', phone: '1', cpf: '123', birthDate: '', consent: false }),
      now,
    );

    expect(result.valid).toBe(false);
    expect(Object.keys(result.fieldErrors).sort()).toEqual([
      'birthDate',
      'consent',
      'cpf',
      'name',
      'phone',
    ]);
  });
});
