// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDefaultConfig } = require('expo/metro-config');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withNativeWind } = require('nativewind/metro');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Metro precisa enxergar a raiz do monorepo: `@fatia/api-client` é consumido
// como TypeScript, direto do source, e mora fora de apps/mobile.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// A busca hierárquica fica LIGADA (padrão) de propósito.
//
// Desligá-la é a receita para pnpm com `node-linker=isolated`, onde cada pacote
// tem o seu node_modules de symlinks. Este repositório usa `node-linker=hoisted`
// (ver .npmrc, exigido pelo Prisma no Docker): quase tudo mora na raiz, e as
// poucas dependências com conflito de versão ficam ANINHADAS dentro do pacote
// que as pede.
//
// Com a busca desligada, essas cópias aninhadas ficam invisíveis e o Metro cai
// na versão da raiz. Foi o que quebrou o app na inicialização: o Jest da API
// hoista `pretty-format@30`, cujo `exports` tem condição `import` apontando para
// um `.mjs`; o `expo` pede a `29`, que não tem. O HMRClient do Expo então fazia
// `prettyFormat.default.default` sobre um `undefined` e o app morria em
// `InitializeCore`, antes de qualquer tela — só a splash na frente.
config.resolver.disableHierarchicalLookup = false;

module.exports = withNativeWind(config, { input: './global.css' });
