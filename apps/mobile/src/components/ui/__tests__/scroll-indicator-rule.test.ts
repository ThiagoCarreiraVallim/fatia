import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * A regra "sem barra de rolagem" do app (#477, `eslint.config.mjs`), rodada no
 * ESLint de verdade com a configuração do repositório.
 */
const ROOT = path.resolve(__dirname, '../../../../../..');
const eslint = new ESLint({ cwd: ROOT });
const FILE = path.join(ROOT, 'apps/mobile/src/components/scroll-indicator-sample.tsx');
const RULE = /Rolagem (horizontal|vertical) sem barra/;

async function scrollMessages(code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: FILE });
  return result!.messages.filter((m) => RULE.test(m.message)).map((m) => m.message);
}

const rn = `import { ScrollView } from 'react-native';\n`;
const animated = `import Animated from 'react-native-reanimated';\n`;

describe('regra da barra de rolagem (#477)', () => {
  it('acusa o ScrollView vertical sem showsVerticalScrollIndicator', async () => {
    const m = await scrollMessages(`${rn}export const A = () => <ScrollView />;\n`);
    expect(m).toEqual([expect.stringMatching(/^Rolagem vertical/)]);
  });

  it('acusa componente com ponto (Animated.ScrollView, o rolo do <Screen>)', async () => {
    const m = await scrollMessages(`${animated}export const A = () => <Animated.ScrollView />;\n`);
    expect(m).toEqual([expect.stringMatching(/^Rolagem vertical/)]);
  });

  it('aceita Animated.FlatList horizontal sem barra', async () => {
    const m = await scrollMessages(
      `${animated}export const A = () => <Animated.FlatList horizontal showsHorizontalScrollIndicator={false} data={[]} renderItem={() => null} />;\n`,
    );
    expect(m).toEqual([]);
  });

  it('horizontal={false} é vertical: exige showsVerticalScrollIndicator', async () => {
    const m = await scrollMessages(
      `${rn}export const A = () => <ScrollView horizontal={false} showsHorizontalScrollIndicator={false} />;\n`,
    );
    expect(m).toEqual([expect.stringMatching(/^Rolagem vertical/)]);
  });

  it('horizontal={false} com showsVerticalScrollIndicator={false} passa', async () => {
    const m = await scrollMessages(
      `${rn}export const A = () => <ScrollView horizontal={false} showsVerticalScrollIndicator={false} />;\n`,
    );
    expect(m).toEqual([]);
  });

  it.each([
    'apps/mobile/app/(app)/community/[groupId]/index.tsx',
    'apps/mobile/src/components/community/community-tabs.tsx',
    'apps/mobile/app/c/[token].tsx',
  ])('os arquivos da #413 ficam fora da regra: %s', async (rel) => {
    const config = await eslint.calculateConfigForFile(path.join(ROOT, rel));
    expect(config.rules?.['no-restricted-syntax']).toBeUndefined();
  });
});
