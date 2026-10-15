import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Toda porta para a IA hospedada passa pelo portão de plano (ADR 024).
 *
 * O 402 de cada rota está provado nos testes delas (`chat.http.spec.ts`,
 * `meal-recognition.service.spec.ts`). Este teste segura o caso seguinte: uma
 * rota nova que chame o agente e esqueça o portão vira IA paga de graça para o
 * Free, sem nenhum teste dela falhar. Quem chama o agente (as três chamadas que
 * gastam inferência) tem de chamar `assertPodeUsar` no mesmo arquivo.
 */
const SRC = join(__dirname, '..', '..');

const CHAMADAS_QUE_GASTAM = [
  /this\.agent\.abrir\(/,
  /this\.agent\.transcrever\(/,
  /\/recognize-meal`/,
];

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return nome === '__tests__' ? [] : arquivos(caminho);
    return caminho.endsWith('.ts') && !caminho.endsWith('.spec.ts') ? [caminho] : [];
  });
}

describe('IA hospedada exige plano', () => {
  const usam = arquivos(SRC).filter((f) => {
    const codigo = readFileSync(f, 'utf8');
    return CHAMADAS_QUE_GASTAM.some((re) => re.test(codigo));
  });

  it('acha os pontos que gastam inferência (o teste não é vácuo)', () => {
    expect(usam.map((f) => relative(SRC, f)).sort()).toEqual([
      'chat/chat.service.ts',
      'nutrition/meal-recognition.service.ts',
    ]);
  });

  it.each(usam.map((f) => [relative(SRC, f), f]))('%s passa por assertPodeUsar', (_nome, f) => {
    expect(readFileSync(f, 'utf8')).toMatch(/this\.acesso\.assertPodeUsar\(/);
  });
});
