module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: ['eslint:recommended', 'plugin:astro/recommended'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  overrides: [
    {
      files: ['*.astro'],
      parser: 'astro-eslint-parser',
      parserOptions: { parser: '@typescript-eslint/parser', extraFileExtensions: ['.astro'] },
    },
    {
      // O parser default (espree) não entende sintaxe de tipos.
      files: ['*.ts'],
      parser: '@typescript-eslint/parser',
    },
  ],
  ignorePatterns: ['dist/', '.astro/', 'node_modules/'],
};
