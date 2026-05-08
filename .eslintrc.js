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
  ],
  ignorePatterns: ['dist/', '.next/', 'node_modules/', '*.js', '*.mjs', '*.cjs'],
};
