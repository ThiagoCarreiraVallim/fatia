// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import globals from 'globals';

/**
 * Configuração do ESLint no formato flat (ESLint 9+).
 *
 * Substitui o `.eslintrc.js`. A diferença que mais importa na migração: no
 * formato antigo, `ignorePatterns` e `overrides` eram campos de um objeto; aqui
 * cada bloco do array é uma configuração, e os blocos posteriores sobrescrevem
 * os anteriores para os arquivos que ambos casam. Ordem passa a ser semântica.
 *
 * O segundo detalhe traiçoeiro: sem `files`, um bloco vale para **tudo**. Por
 * isso todo bloco específico aqui declara o seu `files`, e só o de ignore e o de
 * regras gerais ficam sem.
 */
export default tseslint.config(
  {
    // Único bloco global de ignore. No flat config, `ignores` sozinho num objeto
    // sem `files` substitui o antigo `ignorePatterns`.
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/.astro/**',
      '**/.expo/**',
      '**/build/**',
      '**/coverage/**',
      'apps/site/**', // tem config própria: apps/site/eslint.config.js
      'apps/mobile/android/**',
      'apps/mobile/ios/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2022 },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  {
    // O `next lint` foi aposentado (some no Next 16) e o `eslint-config-next`
    // ainda não fala flat config direito. As regras que importavam eram as do
    // `@next/next`, então elas entram aqui direto, junto de react e react-hooks
    // — que o eslint-config-next trazia de carona.
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      '@next/next': nextPlugin,
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // Versão fixa em vez de 'detect': a detecção resolve a partir do cwd e
    // estoura quando o lint roda da raiz do monorepo. O repo tem um React só
    // (hoisted, ver .npmrc), então não há o que detectar.
    settings: { react: { version: '19.2' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // O JSX transform automático dispensa o import do React.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },

  {
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    // O app nativo nunca passou por `next lint`, então as regras de React que o
    // web ganhava de graça precisam ser ligadas à mão. Sem `react-hooks`, os 60
    // componentes portados perdem a rede que pega dependência faltando em
    // useEffect e hook dentro de condicional.
    files: ['apps/mobile/**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.node, __DEV__: 'readonly' },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: '19.2' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },

  {
    /**
     * As regras que o `eslint-plugin-react-hooks` v7 acrescentou entram como
     * **aviso**, não erro.
     *
     * A v7 é obrigatória para o ESLint 10, e trouxe junto o conjunto da era do
     * React Compiler: `set-state-in-effect`, `purity` e `refs`. Elas apontam 42
     * ocorrências reais no web e no mobile — a maioria é estado derivado de
     * prop calculado dentro de `useEffect`, que a documentação do React
     * desaconselha.
     *
     * São achados legítimos, e por isso ficam visíveis. Mas corrigir 42 sítios
     * dentro de uma PR de dependência tornaria o diff irrevisável e misturaria
     * "subir o ESLint" com "refatorar efeitos". Rastreado na #187.
     */
    files: ['apps/web/**/*.{ts,tsx}', 'apps/mobile/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
    },
  },

  {
    // Os testes usam globais do Jest e do Vitest conforme o pacote.
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.{spec,test}.{ts,tsx}'],
    languageOptions: { globals: { ...globals.jest, ...globals.node } },
  },

  {
    // Arquivos de configuração em JS puro: CommonJS, sem tipos, e o parser de
    // tipos não deve ser aplicado.
    files: ['**/*.{js,cjs,mjs}'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
);
