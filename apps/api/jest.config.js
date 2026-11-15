/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    // O moduleNameMapper abaixo só vale em runtime; o type-check do ts-jest resolve pelos
    // `types` do package.json (dist/), que não existe no CI sem build.
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: { paths: { '@fatia/design': ['../../packages/design/src/index.ts'] } } },
    ],
  },
  // @fatia/design roda do dist/ em produção (o nest build não transpila pacote
  // do workspace); no teste, o source direto, sem exigir build antes.
  moduleNameMapper: { '^@fatia/design$': '<rootDir>/../../packages/design/src/index.ts' },
};
