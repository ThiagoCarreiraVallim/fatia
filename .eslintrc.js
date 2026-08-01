/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error'
  },
  overrides: [
    {
      files: ['apps/web/**/*.{ts,tsx}'],
      extends: ['next/core-web-vitals'],
      settings: {
        next: { rootDir: 'apps/web' },
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
      },
    },
    {
      files: ['apps/api/**/*.ts'],
      rules: {
        '@typescript-eslint/no-require-imports': 'off',
      },
    },
    {
      // O app nativo não passa por `next lint`, então as regras de React que o
      // eslint-config-next traz de graça para o web precisam ser ligadas à mão
      // aqui. Sem `react-hooks`, os 60 componentes portados perderiam a rede que
      // pega dependência faltando em useEffect e hook dentro de condicional.
      files: ['apps/mobile/**/*.{ts,tsx}'],
      env: { node: true, browser: false, es2022: true },
      parserOptions: { ecmaFeatures: { jsx: true } },
      plugins: ['react', 'react-hooks'],
      extends: ['plugin:react/recommended', 'plugin:react-hooks/recommended'],
      settings: { react: { version: 'detect' } },
      rules: {
        // O JSX transform automático dispensa o import do React.
        'react/react-in-jsx-scope': 'off',
        'react/prop-types': 'off',
      },
    },
  ],
  ignorePatterns: ['dist/', '.next/', 'node_modules/', '*.js', '*.mjs', '*.cjs'],
};
