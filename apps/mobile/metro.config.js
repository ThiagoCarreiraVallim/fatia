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
// Com pnpm as dependências não sobem por hierarquia de diretório — cada pacote
// tem o seu node_modules com symlinks. Deixar a busca hierárquica ligada faz o
// Metro resolver a mesma cópia do React por dois caminhos diferentes, o que
// aparece como "Invalid hook call" em tempo de execução.
config.resolver.disableHierarchicalLookup = true;

module.exports = withNativeWind(config, { input: './global.css' });
