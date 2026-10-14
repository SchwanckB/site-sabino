import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Guarda estrutural dos módulos `'use server'`.
 *
 * O Next só permite exportar **funções assíncronas** desses arquivos. Exportar
 * uma constante compila sem reclamar e passa no build, mas no navegador ela
 * chega como uma referência de servidor vazia.
 *
 * Foi exatamente o que derrubou o pré-cadastro: `initialOnboardingState` vinha
 * de `actions.ts`, então `state.fieldErrors` era `undefined` e a primeira
 * leitura de `errors['name']` estourava — toda matrícula travava numa tela de
 * erro, sem nada aparecer no build nem nos testes.
 */

const ACTION_FILES = [
  'app/onboarding/actions.ts',
  'app/admin/actions.ts',
  'app/painel/actions.ts',
];

/** Exports de valor (ignora `export type` e `export interface`). */
function valueExports(source: string): { name: string; isAsyncFunction: boolean }[] {
  const found: { name: string; isAsyncFunction: boolean }[] = [];
  const pattern = /^export\s+(type|interface|async\s+function|function|const|let|var|class)\s+(\w+)/gm;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const kind = match[1] ?? '';
    const name = match[2] ?? '';

    // Tipos somem na compilação; não atravessam a fronteira.
    if (kind === 'type' || kind === 'interface') continue;

    found.push({ name, isAsyncFunction: kind.startsWith('async') });
  }

  return found;
}

describe("módulos 'use server'", () => {
  for (const file of ACTION_FILES) {
    describe(file, () => {
      const source = readFileSync(join(process.cwd(), file), 'utf8');

      it("declara 'use server' na primeira linha", () => {
        expect(source.trimStart().startsWith("'use server'")).toBe(true);
      });

      it('exporta apenas funções assíncronas', () => {
        const invalidos = valueExports(source)
          .filter((e) => !e.isAsyncFunction)
          .map((e) => e.name);

        expect(invalidos).toEqual([]);
      });

      it('exporta pelo menos uma action', () => {
        expect(valueExports(source).length).toBeGreaterThan(0);
      });
    });
  }
});

describe('estado inicial do formulário', () => {
  it('mora fora do módulo de actions', () => {
    const state = readFileSync(join(process.cwd(), 'app/onboarding/state.ts'), 'utf8');

    expect(state).toContain('initialOnboardingState');
    // Checa a diretiva pela posição: o texto aparece no comentário do arquivo,
    // e procurar pela ocorrência daria um falso positivo.
    expect(state.trimStart().startsWith("'use server'")).toBe(false);
  });

  it('tem o formato que o formulário espera', async () => {
    const { initialOnboardingState } = await import('@/app/onboarding/state');

    // `fieldErrors` precisa existir: o formulário faz `errors['name']` logo na
    // primeira renderização.
    expect(initialOnboardingState.fieldErrors).toEqual({});
    expect(initialOnboardingState.status).toBe('idle');
    expect(initialOnboardingState.message).toBe('');
  });
});
