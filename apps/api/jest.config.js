/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: { '^.+\\.ts$': ['ts-jest', {}] },
  // @fatia/design roda do dist/ em produção (o nest build não transpila pacote
  // do workspace); no teste, o source direto, sem exigir build antes.
  moduleNameMapper: { '^@fatia/design$': '<rootDir>/../../packages/design/src/index.ts' },
};
