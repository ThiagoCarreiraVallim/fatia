// @ts-check
import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

/**
 * Config própria do site, no formato flat.
 *
 * O site fica **fora** da config da raiz (que o ignora explicitamente) porque
 * `.astro` exige um parser próprio e um conjunto de regras que não fazem sentido
 * nos outros pacotes.
 *
 * Duas armadilhas da migração vindas do `.eslintrc.cjs`:
 *
 * - O `--ext .js,.ts,.astro` do script sumiu no flat config. A extensão passa a
 *   ser declarada pelo `files` de cada bloco; um `eslint .` sem isso não olha
 *   `.astro` nenhum e passa verde sem ter lido nada.
 * - `astro.configs.recommended` já é um array de blocos no formato novo, então
 *   entra espalhado, não dentro de `extends`.
 */
export default [
  {
    ignores: ['dist/**', '.astro/**', 'node_modules/**'],
  },

  js.configs.recommended,
  ...astro.configs.recommended,

  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, ...globals.es2022 },
    },
  },

  {
    // O parser padrão não entende sintaxe de tipos.
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
  },
];
