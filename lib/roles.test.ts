import { describe, expect, it } from 'vitest';

import {
  ROLES,
  ROLE_LABELS,
  can,
  isRole,
  isStaff,
  normalizeRole,
  permissionsOf,
  type Permission,
  type Role,
} from './roles';

/**
 * A tabela de permissões é a única coisa entre o professor e o caixa da
 * academia. Ela é lida em três lugares — menu, página e server action — e um
 * erro aqui vaza para os três de uma vez.
 */

const TODAS: readonly Permission[] = [
  'aula',
  'alunos',
  'calendario',
  'matricula',
  'dinheiro',
  'horarios',
  'relatorios',
  'contas',
];

describe('can', () => {
  it('gestão pode tudo', () => {
    for (const permission of TODAS) {
      expect(can('GESTAO', permission)).toBe(true);
    }
  });

  it('professor cuida do tatame', () => {
    expect(can('PROFESSOR', 'aula')).toBe(true);
    expect(can('PROFESSOR', 'alunos')).toBe(true);
    expect(can('PROFESSOR', 'calendario')).toBe(true);
  });

  /*
   * O coração da separação pedida: o professor abre aula e lança presença, e
   * não chega perto de dinheiro, grade nem acesso das outras contas. A lista
   * é explícita, e não derivada da tabela, de propósito — se alguém afrouxar
   * `PROFESSOR_PERMISSIONS` por engano, um teste que lesse a mesma tabela
   * passaria junto com o erro.
   */
  it('professor não mexe em dinheiro, grade, matrícula, relatório nem acesso', () => {
    expect(can('PROFESSOR', 'dinheiro')).toBe(false);
    expect(can('PROFESSOR', 'horarios')).toBe(false);
    expect(can('PROFESSOR', 'matricula')).toBe(false);
    expect(can('PROFESSOR', 'relatorios')).toBe(false);
    expect(can('PROFESSOR', 'contas')).toBe(false);
  });

  it('aluno não pode nada do painel da academia', () => {
    for (const permission of TODAS) {
      expect(can('ALUNO', permission)).toBe(false);
    }
  });

  it('a tabela cobre as três contas, sem papel sem resposta', () => {
    for (const role of ROLES) {
      for (const permission of TODAS) {
        expect(typeof can(role, permission)).toBe('boolean');
      }
    }
  });

  it('professor é subconjunto estrito da gestão', () => {
    const gestao = new Set(permissionsOf('GESTAO'));
    for (const permission of permissionsOf('PROFESSOR')) {
      expect(gestao.has(permission)).toBe(true);
    }
    expect(permissionsOf('PROFESSOR').length).toBeLessThan(permissionsOf('GESTAO').length);
  });
});

describe('isStaff', () => {
  it('professor e gestão entram no /admin', () => {
    expect(isStaff('GESTAO')).toBe(true);
    expect(isStaff('PROFESSOR')).toBe(true);
  });

  it('aluno não', () => {
    expect(isStaff('ALUNO')).toBe(false);
  });

  it('quem é staff tem ao menos uma permissão, e quem não é não tem nenhuma', () => {
    for (const role of ROLES) {
      expect(permissionsOf(role).length > 0).toBe(isStaff(role));
    }
  });
});

describe('normalizeRole', () => {
  it('aceita os três papéis atuais', () => {
    for (const role of ROLES) {
      expect(normalizeRole(role)).toBe(role);
    }
  });

  /*
   * O caso que decide o que acontece no deploy.
   *
   * Até existirem dois níveis, todo professor promovido era gravado como
   * `ADMIN` em `publicMetadata.role`. Essas contas viram PROFESSOR — o lado
   * seguro da conversão. Mapear para GESTAO daria acesso ao caixa, no próximo
   * carregamento de página, a todo mundo que já era admin, que é exatamente o
   * que esta separação existe para impedir.
   */
  it('conta antiga gravada como ADMIN vira professor, não gestão', () => {
    expect(normalizeRole('ADMIN')).toBe('PROFESSOR');
  });

  it('recusa o que não reconhece, em vez de inventar um papel', () => {
    expect(normalizeRole('admin')).toBeNull();
    expect(normalizeRole('Gestao')).toBeNull();
    expect(normalizeRole('SUPERADMIN')).toBeNull();
    expect(normalizeRole('')).toBeNull();
    expect(normalizeRole(undefined)).toBeNull();
    expect(normalizeRole(null)).toBeNull();
    expect(normalizeRole(1)).toBeNull();
    expect(normalizeRole({ role: 'GESTAO' })).toBeNull();
  });
});

describe('isRole', () => {
  /*
   * `setAccountRoleAction` valida o campo do formulário com isto. `ADMIN` é
   * aceito na leitura (conta antiga) e recusado na escrita: gravar o papel
   * velho de novo recriaria o legado que `normalizeRole` existe para resolver.
   */
  it('não aceita o ADMIN do legado como valor para gravar', () => {
    expect(isRole('ADMIN')).toBe(false);
  });

  it('aceita os três papéis atuais', () => {
    for (const role of ROLES) expect(isRole(role)).toBe(true);
  });

  it('recusa qualquer outra coisa', () => {
    expect(isRole('PROFESSORA')).toBe(false);
    expect(isRole(null)).toBe(false);
  });
});

describe('ROLE_LABELS', () => {
  it('todo papel tem rótulo em português', () => {
    for (const role of ROLES) {
      expect(ROLE_LABELS[role as Role].length).toBeGreaterThan(0);
    }
  });
});
