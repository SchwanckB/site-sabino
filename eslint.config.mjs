import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/*
 * Flat config, porque o `next lint` saiu na 16.
 *
 * Até a 15 o comando do Next achava o `.eslintrc.json` e decidia sozinho o que
 * varrer. Agora o lint é o ESLint direto (`eslint .`), e quem limita o alcance
 * é este arquivo — daí o `ignores` explícito para a saída de build, que antes o
 * Next já pulava por conta.
 *
 * O `eslint-config-next@16` exporta flat config de verdade (`Linter.Config[]`),
 * então não precisa do `FlatCompat` da ponte entre os dois formatos.
 */
const config = [
  {
    ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts', '**/*.tsbuildinfo'],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      /*
       * `const { consent: _, ...resto } = cadastro` é como os testes montam um
       * formulário sem um campo. O nome descartado não é código morto, é a
       * forma de dizer qual campo saiu — então `_` e os irmãos de um rest não
       * contam como variável sem uso.
       */
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
];

export default config;
